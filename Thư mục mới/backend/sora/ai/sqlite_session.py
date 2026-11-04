"""Kết nối SQLite ngắn hạn: commit/rollback và luôn đóng handle trên Windows.

Context manager mặc định của sqlite3.Connection chỉ quản lý transaction,
không tự đóng kết nối. Giữ các thao tác dưới _LOCK tại module gọi.
"""
from contextlib import contextmanager
import sqlite3


@contextmanager
def sqlite_session(database, timeout=20):
    connection = sqlite3.connect(database, timeout=timeout)
    try:
        with connection:
            yield connection
    finally:
        connection.close()
