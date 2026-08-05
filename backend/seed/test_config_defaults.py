import json
import os
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class ConfigDefaultsTests(unittest.TestCase):
    def test_local_env_uses_us_east_1(self):
        with open(os.path.join(ROOT_DIR, "env.json"), encoding="utf-8") as handle:
            env_config = json.load(handle)

        for function_config in env_config.values():
            self.assertEqual(function_config["AWS_REGION"], "us-east-1")
            self.assertEqual(function_config["AWS_DEFAULT_REGION"], "us-east-1")

    def test_template_defines_api_gateway(self):
        with open(os.path.join(ROOT_DIR, "template.yaml"), encoding="utf-8") as handle:
            template_text = handle.read()

        self.assertIn("ApiGatewayRestApi", template_text)
        self.assertIn("AWS::Serverless::Api", template_text)


if __name__ == "__main__":
    unittest.main()
