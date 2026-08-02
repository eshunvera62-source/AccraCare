import importlib.util
import os
import unittest

MODULE_PATH = os.path.join(os.path.dirname(__file__), "load_seed_data.py")
spec = importlib.util.spec_from_file_location("load_seed_data", MODULE_PATH)
load_seed_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(load_seed_data)


class LoadSeedDataTests(unittest.TestCase):
    def test_resolve_seed_file_path_defaults_to_script_directory(self):
        resolved = load_seed_data.resolve_seed_file_path("seed_slots.json")
        self.assertTrue(os.path.isabs(resolved))
        self.assertTrue(resolved.endswith("seed_slots.json"))


if __name__ == "__main__":
    unittest.main()
