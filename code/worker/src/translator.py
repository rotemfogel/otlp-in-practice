import argostranslate.package
import argostranslate.translate
import logging
from opentelemetry import trace
from opentelemetry.trace import StatusCode

tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)


class Translator:
    """Local translation service using Argos Translate."""

    def __init__(self):
        """Initialize translator and ensure models are available."""
        try:
            # Update package index
            argostranslate.package.update_package_index()

            # Get installed packages
            installed_packages = argostranslate.package.get_installed_packages()
            logger.info("Installed translation packages", extra={"count": len(installed_packages)})

            # Log available language pairs
            for pkg in installed_packages:
                logger.info("Available translation package", extra={"from_code": pkg.from_code, "to_code": pkg.to_code})

        except Exception as e:
            logger.error("Failed to initialize translator", extra={"error": str(e)})
            raise

    def translate(self, text: str, source: str, target: str) -> str:
        """
        Translate text from source language to target language.

        Args:
            text: Text to translate
            source: Source language code (e.g., 'en')
            target: Target language code (e.g., 'es')

        Returns:
            Translated text

        Raises:
            ValueError: If language pair is not available
            RuntimeError: If translation fails
        """
        if not text or not text.strip():
            return text
        with tracer.start_as_current_span(
            "translate_text",
            attributes={
                "translation.source_language": source,
                "translation.target_language": target,
                "translation.text_length": len(text),
            },
        ) as span:
            try:
                # Get translation object
                translation = argostranslate.translate.get_translation_from_codes(
                    source, target
                )

                if translation is None:
                    error_msg = (
                        f"Translation model not available for {source} -> {target}"
                    )
                    logger.error("Translation model not available", extra={"source_language": source, "target_language": target})
                    span.set_status(trace.Status(StatusCode.ERROR, error_msg))
                    raise ValueError(error_msg)

                # Perform translation
                translated_text = translation.translate(text)

                span.set_attribute("translation.output_length", len(translated_text))
                span.set_status(trace.Status(StatusCode.OK))

                logger.info(
                    "Text translated successfully",
                    extra={"source_language": source, "target_language": target, "input_length": len(text), "output_length": len(translated_text)},
                )

                return translated_text

            except ValueError:
                raise
            except Exception as e:
                error_msg = f"Translation failed ({source} -> {target}): {str(e)}"
                span.record_exception(e)
                span.set_status(trace.Status(StatusCode.ERROR, str(e)))
                logger.error("Translation failed", extra={"source_language": source, "target_language": target, "error": str(e)})
                raise RuntimeError(error_msg) from e
