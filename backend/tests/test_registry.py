import pytest

from gridsim.registry import Registry, UnknownKeyError


def test_register_get_all() -> None:
    reg: Registry[int] = Registry("thing")
    reg.register("a", 1)
    reg.register("b", 2)
    assert reg.get("a") == 1
    assert reg.all() == [1, 2]
    assert reg.keys() == ["a", "b"]
    assert "a" in reg and "c" not in reg


def test_unknown_key_message() -> None:
    reg: Registry[int] = Registry("thing")
    reg.register("a", 1)
    with pytest.raises(UnknownKeyError, match="Unknown thing 'zz'. Known: a"):
        reg.get("zz")


def test_duplicate_and_decorator() -> None:
    reg: Registry[object] = Registry("thing")

    @reg.register_as("x")
    class X:
        pass

    assert isinstance(reg.get("x"), X)
    with pytest.raises(ValueError, match="already registered"):
        reg.register("x", object())
