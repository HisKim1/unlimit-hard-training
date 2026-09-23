"""Run: python tools/test_sprites.py — asymmetric sprite checks image flipX."""
import numpy as np
from PIL import Image
from slice_sprites import _src_cache, process_image

pixels = np.array([[[255, 0, 0, 255], [0, 0, 255, 255]]], dtype=np.uint8)
_src_cache["test"] = Image.fromarray(pixels)
cfg = {"sources": {"test": {}}}
result = process_image(cfg, "icon_test", {"src": "test", "flipX": True})
assert np.array_equal(np.array(result["canvases"][0]), pixels[:, ::-1])
print("PASS: image flipX")
