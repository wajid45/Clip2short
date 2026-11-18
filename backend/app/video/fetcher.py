"""Outbound HTTP for public pages and files, with browser-like headers and SSRF protection."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

import httpx

from .source import is_private_host

BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"


def fetch(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    json: object | None = None,
    timeout: float = 15,
) -> httpx.Response:
    """One request with a timeout and browser-like headers. Raises httpx errors on network failure."""
    h = {"User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9", **(headers or {})}
    with httpx.Client(follow_redirects=True, timeout=timeout) as c:
        return c.request(method, url, headers=h, json=json)


def assert_public_url(raw: str) -> None:
    """Resolves the host and refuses private addresses (for user-supplied direct links)."""
    host = urlsplit(raw).hostname or ""
    if is_private_host(host):
        raise ValueError("Private network addresses are not allowed.")
    try:
        ipaddress.ip_address(host.strip("[]"))
        return
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise ValueError("That host couldn't be found.") from None
    for info in infos:
        addr = str(info[4][0])
        ip = ipaddress.ip_address(addr.split("%")[0])
        if is_private_host(addr) or ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError("That host resolves to a private network address.")
