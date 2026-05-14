import logging
import sys

from pythonjsonlogger.json import JsonFormatter


def setup_logging(level: int | str = logging.INFO) -> None:
    """Configure root logger with structured JSON formatting."""
    handler = logging.StreamHandler(sys.stdout)
    formatter = JsonFormatter(
        fmt=["asctime", "levelname", "name", "message"],
        rename_fields={"asctime": "timestamp", "levelname": "level"},
    )
    handler.setFormatter(formatter)
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(level)
