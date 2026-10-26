"""A tiny generic registry used by all extension points (networks, profiles, studies)."""

from __future__ import annotations

from collections.abc import Callable


class UnknownKeyError(KeyError):
    """Raised when a registry lookup fails."""

    def __str__(self) -> str:  # KeyError quotes its message; keep it readable
        return str(self.args[0]) if self.args else "unknown key"


class Registry[T]:
    """Maps string keys to extension objects.

    Usage::

        GENERATORS: Registry[ProfileGenerator] = Registry("profile generator")
        GENERATORS.register("pv", PvGenerator())

        @GENERATORS.register_as("constant")   # decorator form (instantiates classes)
        class Constant: ...
    """

    def __init__(self, kind: str) -> None:
        self.kind = kind
        self._items: dict[str, T] = {}

    def register(self, key: str, obj: T) -> T:
        if key in self._items:
            raise ValueError(f"{self.kind} '{key}' is already registered")
        self._items[key] = obj
        return obj

    def register_as(self, key: str) -> Callable[[type], type]:
        """Class decorator: instantiate the class and register the instance under `key`."""

        def deco(cls: type) -> type:
            self.register(key, cls())
            return cls

        return deco

    def get(self, key: str) -> T:
        try:
            return self._items[key]
        except KeyError:
            known = ", ".join(sorted(self._items)) or "(none)"
            raise UnknownKeyError(f"Unknown {self.kind} '{key}'. Known: {known}") from None

    def __contains__(self, key: object) -> bool:
        return key in self._items

    def keys(self) -> list[str]:
        return list(self._items)

    def all(self) -> list[T]:
        return list(self._items.values())
