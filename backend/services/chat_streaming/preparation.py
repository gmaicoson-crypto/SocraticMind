from copy import deepcopy
import logging
from fastapi import HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session, sessionmaker
from models.progress import ChatMessage
from models.node import Node
from models.topic import Topic
from models.user import User
from core.errors import ApiError
from core.context_budget import ContextWindowExceeded, count_method
from services.chat_titles import schedule_title
from services.chat_lifecycle import begin_chat_turn, finish_chat_turn, get_chat_turn
from services.attachments.service import summaries_for_messages
from services.web_search_executor import CapacityExceeded

from schemas.chat import ChatRequest
from core.user_llm import load_user_profiles
from typing import Callable
from .types import ChatStreamContext, ChatStreamDependencies
from .delivery import start_generation
from .events import stream_events

log = logging.getLogger(__name__)


def prepare_chat_stream(
    req: ChatRequest,
    current_user: User,
    db: Session,
    model_resolver: Callable[[str | None, int], str],
    runtime: ChatStreamDependencies,
):
    assemble_chat_context = runtime.assemble_chat_context
    load_user_profiles(db, current_user.id)
    # topic_overview 模式下 node_key 承载的是主题名，不需要查节点表
    if req.kind == "topic_overview":
        topic = (
            db.query(Topic)
            .filter(
                Topic.id == req.topic_id,
                Topic.user_id == current_user.id,
            )
            .first()
        )
        if not topic:
            raise HTTPException(status_code=404, detail="主题不存在")
        node_label = topic.title
        node_sub = ""
    elif req.mode == "normal":
        node_label = "通用助手"
        node_sub = "General Assistant"
    else:
        # 通过 join Topic 校验节点归属，防止越权访问其他用户的节点
        node = (
            db.query(Node)
            .join(Topic)
            .filter(
                Node.node_key == req.node_key,
                Topic.id == req.topic_id,
                Topic.user_id == current_user.id,
            )
            .first()
        )
        if not node:
            raise HTTPException(status_code=404, detail="节点不存在")
        node_label = node.label
        node_sub = node.sub

    model_id = model_resolver(req.model, current_user.id)
    quote_source = None
    if req.quote_source_id is not None:
        quote_source = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.id == req.quote_source_id,
                ChatMessage.user_id == current_user.id,
                ChatMessage.session_id == req.session_id,
                ChatMessage.mode == req.mode,
                ChatMessage.role == "ai",
            )
            .one_or_none()
        )
        if quote_source is None or not req.quote_text:
            raise HTTPException(status_code=400, detail="引用消息无效")

    started = begin_chat_turn(
        db,
        user_id=current_user.id,
        topic_id=req.topic_id if req.mode == "socratic" else None,
        session_id=req.session_id,
        node_key=node_label if req.kind == "topic_overview" else req.node_key,
        user_input=req.user_input,
        mode=req.mode,
        request_id=req.request_id,
        model_id=model_id,
        kind=req.kind,
        ai_style=req.ai_style,
        quote_text=req.quote_text,
        quote_source_id=req.quote_source_id,
        regenerate_message_id=req.regenerate_message_id,
        web_mode=req.web_mode,
        attachment_ids=req.attachment_ids,
    )
    user_id = current_user.id
    if req.kind == "qa" and req.regenerate_message_id is None:
        try:
            source = req.user_input
            if req.attachment_ids:
                attached = summaries_for_messages(db, [started.user_message.id]).get(
                    started.user_message.id, []
                )
                source += "\n附件：" + "、".join(item["name"] for item in attached)
            if source.strip():
                schedule_title(
                    db,
                    user_id=current_user.id,
                    session_id=req.session_id,
                    mode=req.mode,
                    source_text=source,
                    model_id=model_id,
                )
                db.commit()
        except Exception as error:
            db.rollback()
            log.warning("chat_title_schedule_failed error_type=%s", type(error).__name__)
    session_pk = started.session.id
    generation_token = started.turn.generation_token
    user_msg, ai_msg = started.user_message, started.ai_message
    model_user_input = user_msg.content
    ids = {"user": user_msg.id, "ai": ai_msg.id}
    initial_web = deepcopy((ai_msg.metadata_json or {}).get("web"))

    event, web_event = stream_events(req.request_id, ids["ai"])

    if started.replayed:
        from services.attachments.evidence import hydrate_message_sources

        if initial_web is not None:
            initial_web["sources"] = hydrate_message_sources(
                db, user_id=user_id, messages=[ai_msg]
            ).get(ai_msg.id, initial_web.get("sources", []))
        if started.turn.status == "generating":
            raise ApiError(
                status_code=409,
                code="CHAT_REQUEST_RUNNING",
                message="该请求仍在生成，请稍后恢复会话",
                retryable=True,
            )
        replay_status = started.turn.status
        replay_content = ai_msg.content
        replay_error = started.turn.error_code

        def replay():
            yield event({"msg_ids": ids})
            if initial_web is not None:
                yield web_event(
                    {"type": "web_status", "status": initial_web["status"], "web": initial_web}
                )
                for warning in initial_web.get("warnings", []):
                    yield web_event({"type": "web_warning", "warning": warning, "web": initial_web})
            if replay_content:
                yield event({"text": replay_content})
            if initial_web is not None:
                yield web_event({"type": "web_sources", "web": initial_web, "final": True})
            yield event({"request_state": {"status": replay_status}})
            if replay_status != "complete":
                yield event(
                    {
                        "error": {
                            "code": replay_error or "CHAT_REQUEST_INCOMPLETE",
                            "message": "此前请求未完成，请重新生成",
                            "retryable": True,
                        }
                    }
                )
            yield "data: [DONE]\n\n"

        return StreamingResponse(replay(), media_type="text/event-stream")

    context_args = dict(
        user_message_id=user_msg.id,
        model_id=model_id,
        node_key=req.node_key,
        node_label=node_label,
        node_sub=node_sub,
        user_input=model_user_input,
        mode=req.mode,
        ai_style=req.ai_style,
        kind=req.kind,
        regenerate=req.regenerate_message_id is not None,
    )
    from models.attachment import Attachment

    has_attachment_context = (
        req.kind == "qa"
        and db.query(Attachment.id)
        .filter_by(
            user_id=user_id,
            session_id=req.session_id,
        )
        .first()
        is not None
    )
    try:
        # Resource preparation emits progress after SSE opens. Text-only requests
        # retain their immediate HTTP context validation contract.
        prepared = (
            None
            if has_attachment_context
            else assemble_chat_context(
                db, session=started.session, quote_source=quote_source, **context_args
            )
        )
    except Exception as error:
        finish_chat_turn(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            content="",
            status="failed",
            error_code=(
                "CHAT_CONTEXT_TOO_LARGE"
                if isinstance(error, ContextWindowExceeded)
                else "CONTEXT_PREPARATION_FAILED"
            ),
        )
        if isinstance(error, ContextWindowExceeded):
            return JSONResponse(
                status_code=413,
                content={
                    "code": "CHAT_CONTEXT_TOO_LARGE",
                    "message": "当前问题或引用内容超过模型可用窗口，请缩小引用范围或拆分输入",
                    "retryable": False,
                    "msg_ids": ids,
                },
            )
        raise

    input_tokens = prepared.input_tokens if prepared else 0
    log.info(
        "chat_context_prepared request=%s model=%s input_tokens=%d count_method=%s omitted_history=%s",
        req.request_id,
        model_id,
        input_tokens,
        count_method(model_id),
        prepared.omitted_history if prepared else False,
    )
    context_session_factory = sessionmaker(bind=db.get_bind(), autoflush=False)
    # No request-scoped read transaction is held while waiting for the provider.
    db.commit()

    context = ChatStreamContext(
        req=req,
        model_id=model_id,
        node_label=node_label,
        node_sub=node_sub,
        prepared=prepared,
        has_attachment_context=has_attachment_context,
        context_args=context_args,
        context_session_factory=context_session_factory,
        user_id=user_id,
        session_pk=session_pk,
        generation_token=generation_token,
        model_user_input=model_user_input,
        ids=ids,
        initial_web=initial_web,
    )
    try:
        events = start_generation(context, runtime)
    except CapacityExceeded:
        finish_chat_turn(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            content="",
            status="failed",
            error_code="AI_BUSY",
        )
        turn = get_chat_turn(db, user_id=user_id, request_id=req.request_id)
        status = "interrupted" if turn is None or turn.status == "interrupted" else "failed"
        events = iter(
            (
                event({"msg_ids": ids}),
                event({"request_state": {"status": status}}),
                event(
                    {
                        "error": {
                            "code": "AI_BUSY",
                            "message": "当前生成请求较多，请稍后重试。",
                            "retryable": True,
                        }
                    }
                ),
                "data: [DONE]\n\n",
            )
        )
    return StreamingResponse(
        events,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
