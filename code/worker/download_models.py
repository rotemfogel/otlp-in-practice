#!/usr/bin/env python3
"""Download and install Argos Translate language models."""

import argostranslate.package
import argostranslate.translate


def download_models():
    """Download translation models for supported languages."""
    print("Updating Argos Translate package index...")
    argostranslate.package.update_package_index()

    available_packages = argostranslate.package.get_available_packages()
    languages = ["es", "fr", "de"]

    print(f"Downloading models for {len(languages)} languages...")

    for lang in languages:
        pkg = next(
            (
                p
                for p in available_packages
                if p.from_code == "en" and p.to_code == lang
            ),
            None,
        )

        if pkg:
            print(f"Downloading en -> {lang}...")
            download_path = pkg.download()
            argostranslate.package.install_from_path(download_path)
            print(f"✓ Installed en -> {lang}")
        else:
            print(f"✗ Package not found: en -> {lang}")

    print("\nModel download complete!")


if __name__ == "__main__":
    download_models()
