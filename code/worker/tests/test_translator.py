import pytest
from unittest.mock import MagicMock, patch
from src.translator import Translator


@patch("argostranslate.package.update_package_index")
@patch("argostranslate.package.get_installed_packages")
def test_translator_init(mock_get_packages, mock_update_index):
    """Test Translator initialization."""
    mock_pkg = MagicMock()
    mock_pkg.from_code = "en"
    mock_pkg.to_code = "es"
    mock_get_packages.return_value = [mock_pkg]

    translator = Translator()

    mock_update_index.assert_called_once()
    mock_get_packages.assert_called_once()


@patch("argostranslate.package.update_package_index")
@patch("argostranslate.package.get_installed_packages")
@patch("argostranslate.translate.get_translation_from_codes")
def test_translate_success(mock_get_translation, mock_get_packages, mock_update_index):
    """Test successful translation."""
    # Setup mocks
    mock_pkg = MagicMock()
    mock_pkg.from_code = "en"
    mock_pkg.to_code = "es"
    mock_get_packages.return_value = [mock_pkg]

    mock_translation = MagicMock()
    mock_translation.translate.return_value = "Hola, mundo!"
    mock_get_translation.return_value = mock_translation

    # Test
    translator = Translator()
    result = translator.translate("Hello, world!", "en", "es")

    assert result == "Hola, mundo!"
    mock_get_translation.assert_called_once_with("en", "es")
    mock_translation.translate.assert_called_once_with("Hello, world!")


@patch("argostranslate.package.update_package_index")
@patch("argostranslate.package.get_installed_packages")
@patch("argostranslate.translate.get_translation_from_codes")
def test_translate_empty_text(
    mock_get_translation, mock_get_packages, mock_update_index
):
    """Test translating empty text."""
    mock_pkg = MagicMock()
    mock_get_packages.return_value = [mock_pkg]

    translator = Translator()
    result = translator.translate("", "en", "es")

    assert result == ""
    mock_get_translation.assert_not_called()


@patch("argostranslate.package.update_package_index")
@patch("argostranslate.package.get_installed_packages")
@patch("argostranslate.translate.get_translation_from_codes")
def test_translate_whitespace_text(
    mock_get_translation, mock_get_packages, mock_update_index
):
    """Test translating whitespace-only text."""
    mock_pkg = MagicMock()
    mock_get_packages.return_value = [mock_pkg]

    translator = Translator()
    result = translator.translate("   ", "en", "es")

    assert result == "   "
    mock_get_translation.assert_not_called()


@patch("argostranslate.package.update_package_index")
@patch("argostranslate.package.get_installed_packages")
@patch("argostranslate.translate.get_translation_from_codes")
def test_translate_model_not_found(
    mock_get_translation, mock_get_packages, mock_update_index
):
    """Test translation when model is not available."""
    mock_pkg = MagicMock()
    mock_get_packages.return_value = [mock_pkg]
    mock_get_translation.return_value = None

    translator = Translator()

    with pytest.raises(ValueError) as exc_info:
        translator.translate("Hello", "en", "xx")

    assert "not available" in str(exc_info.value)


@patch("argostranslate.package.update_package_index")
@patch("argostranslate.package.get_installed_packages")
@patch("argostranslate.translate.get_translation_from_codes")
def test_translate_runtime_error(
    mock_get_translation, mock_get_packages, mock_update_index
):
    """Test translation runtime error."""
    mock_pkg = MagicMock()
    mock_get_packages.return_value = [mock_pkg]

    mock_translation = MagicMock()
    mock_translation.translate.side_effect = Exception("Translation failed")
    mock_get_translation.return_value = mock_translation

    translator = Translator()

    with pytest.raises(RuntimeError) as exc_info:
        translator.translate("Hello", "en", "es")

    assert "Translation failed" in str(exc_info.value)
