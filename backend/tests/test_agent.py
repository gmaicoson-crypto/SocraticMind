import unittest
from types import SimpleNamespace
from unittest.mock import patch

from ai.agent import chat_stream


class ChatStreamTests(unittest.TestCase):
    def test_ignores_metadata_chunks_without_choices(self):
        chunks = [
            SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="first"))]),
            SimpleNamespace(choices=[]),
            SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=None))]),
            SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="second"))]),
        ]
        completions = SimpleNamespace(create=lambda **_: iter(chunks))
        client = SimpleNamespace(chat=SimpleNamespace(completions=completions))

        with patch("ai.agent.get_ai_client", return_value=client):
            result = list(
                chat_stream(
                    messages=[],
                    node_label="test node",
                    node_sub="",
                    user_input="test question",
                )
            )

        self.assertEqual(result, ["first", "second"])

    def test_adds_memory_context_without_text_control_protocols(self):
        captured = {}

        def create(**kwargs):
            captured.update(kwargs)
            return iter([])

        completions = SimpleNamespace(create=create)
        client = SimpleNamespace(chat=SimpleNamespace(completions=completions))

        with patch("ai.agent.get_ai_client", return_value=client):
            list(
                chat_stream(
                    messages=[],
                    node_label="test node",
                    node_sub="",
                    user_input="test question",
                    memories=[{"kind": "preference", "content": "Use examples"}],
                )
            )

        system_prompt = captured["messages"][0]["content"]
        self.assertIn("Use examples", system_prompt)
        self.assertNotIn("[MASTERED]", system_prompt)
        self.assertNotIn("[CHOICES]", system_prompt)


if __name__ == "__main__":
    unittest.main()
