import json


def stream_events(request_id: str, ai_message_id: int):
    def event(payload):
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def web_event(payload):
        return event({**payload, "request_id": request_id, "ai_message_id": ai_message_id})

    return event, web_event
