from datetime import datetime, timedelta, timezone
from copy import deepcopy
import logging
import re
from time import perf_counter, monotonic
from ai.agent import ChatStreamError
from models import ChatSession
from models.progress import ChatMessage
from core.errors import ApiError
from core.context_budget import ContextWindowExceeded, count_messages, get_context_policy
from services.web_evidence import apply_web_context, cited_source_ids, invalid_source_ids
from services.knowledge.chat_context import add_topic_materials, validate_topic_sources
from services.chat_stream_runner import cancellable_chat_stream
from services.chat_lifecycle import (
    finish_chat_turn,
    checkpoint_interrupted_content,
    get_chat_turn,
)

from .types import ChatStreamContext, ChatStreamDependencies
from .events import stream_events

log = logging.getLogger(__name__)


def generate(context: ChatStreamContext, runtime: ChatStreamDependencies):
    req, db, started = context.req, context.db, context.started
    model_id, node_label, node_sub = context.model_id, context.node_label, context.node_sub
    quote_source, prepared = context.quote_source, context.prepared
    has_attachment_context = context.has_attachment_context
    context_args, context_session_factory = context.context_args, context.context_session_factory
    user_id, session_pk = context.user_id, context.session_pk
    generation_token = context.generation_token
    model_user_input = context.model_user_input
    ids = context.ids
    initial_web = context.initial_web
    event, web_event = stream_events(req.request_id, ids["ai"])
    chat_stream = runtime.chat_stream
    assemble_chat_context = runtime.assemble_chat_context
    iter_web_search = runtime.iter_web_search
    schedule_chat_summary = runtime.schedule_chat_summary
    run_one_summary_job = runtime.run_one_summary_job
    refresh_generation_lease = runtime.refresh_generation_lease
    reserve_web_queries = runtime.reserve_web_queries
    full_text = []
    stream = None
    began = perf_counter()
    checkpoint = began
    first_chunk = True
    terminal = False
    active_context = prepared
    attachment_evidence = None
    deadline = monotonic() + 240
    web = deepcopy(initial_web)

    def check_active():
        if attachment_evidence:
            validate_topic_sources(db, user_id=user_id, sources=attachment_evidence.sources)
        if has_attachment_context and monotonic() >= deadline:
            raise ApiError(
                status_code=504,
                code="ATTACHMENT_CONTEXT_TIMEOUT",
                message="资料处理或回答超时，请缩小范围后重试",
                retryable=True,
            )
        if not refresh_generation_lease(
            db, user_id=user_id, request_id=req.request_id, generation_token=generation_token
        ):
            db.rollback()
            raise ApiError(
                status_code=409,
                code="CHAT_REQUEST_CANCELLED",
                message="本次生成已停止或会话内容已改变",
                retryable=True,
            )

    def reserve_search(queries):
        allowed = reserve_web_queries(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            queries=queries,
        )
        # Cancellation must not become a quota warning and then a normal answer.
        check_active()
        return allowed

    def persist_web():
        if not refresh_generation_lease(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            web=web,
        ):
            db.rollback()
            raise ApiError(
                status_code=409,
                code="CHAT_REQUEST_CANCELLED",
                message="本次生成已停止或会话内容已改变",
                retryable=True,
            )

    try:
        yield event({"msg_ids": ids})
        if not refresh_generation_lease(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            preparation={
                "status": "preparing",
                "deadline_at": (
                    datetime.now(timezone.utc) + timedelta(seconds=max(0, deadline - monotonic()))
                ).isoformat(),
            }
            if has_attachment_context
            else None,
        ):
            raise ApiError(
                status_code=409,
                code="CHAT_REQUEST_CANCELLED",
                message="本次生成已停止",
                retryable=True,
            )
        if has_attachment_context:
            from services.attachments.context import (
                iter_prepare_attachments,
                PreparedAttachments,
            )

            yield event(
                {
                    "type": "attachment_context_preparing",
                    "status": "preparing",
                    "request_id": req.request_id,
                    "ai_message_id": ids["ai"],
                }
            )
            for update in iter_prepare_attachments(
                db,
                session=started.session,
                user_message_id=ids["user"],
                model_id=model_id,
                user_input=model_user_input,
                mode=req.mode,
                check_active=check_active,
                deadline=min(deadline, monotonic() + 90),
                quote_source=quote_source,
            ):
                check_active()
                if isinstance(update, PreparedAttachments):
                    attachment_evidence = update
                else:
                    if not refresh_generation_lease(
                        db,
                        user_id=user_id,
                        request_id=req.request_id,
                        generation_token=generation_token,
                        preparation=update,
                    ):
                        check_active()
                    yield event(
                        {
                            **update,
                            "type": "attachment_context_progress",
                            "request_id": req.request_id,
                            "ai_message_id": ids["ai"],
                        }
                    )
            if attachment_evidence is None:
                raise ApiError(
                    status_code=502,
                    code="ATTACHMENT_CONTEXT_FAILED",
                    message="资料未能整理完成，请重试",
                    retryable=True,
                )
            attachment_evidence = add_topic_materials(
                db,
                session=started.session,
                prepared=attachment_evidence,
                model_id=model_id,
                node_label=node_label,
                user_input=model_user_input,
                kind=req.kind,
            )
            context_args["attachments"] = attachment_evidence
            context_session = db.get(ChatSession, session_pk)
            if context_session is None:
                check_active()
            active_context = assemble_chat_context(db, session=context_session, **context_args)
            db.commit()
            if not refresh_generation_lease(
                db,
                user_id=user_id,
                request_id=req.request_id,
                generation_token=generation_token,
                preparation={"status": "ready"},
                attachment_derived=attachment_evidence.attachment_derived,
            ):
                check_active()
            yield event(
                {
                    "type": "attachment_context_ready",
                    "status": "ready",
                    "request_id": req.request_id,
                    "ai_message_id": ids["ai"],
                }
            )
        if active_context.omitted_history:
            yield event({"type": "context_compacting"})
            schedule_chat_summary(db, session_id=session_pk, model_id=model_id)
            if has_attachment_context:
                # The independent summary worker owns historical compaction.
                # Do not let a synchronous summary outlive this turn's deadline.
                raise ApiError(
                    status_code=503,
                    code="CHAT_CONTEXT_NOT_READY",
                    message="较早的对话正在后台整理，请稍后重试；问题与附件已保留",
                    retryable=True,
                )
            # Reuse the durable worker's lease and version checks. One bounded
            # attempt avoids silently dropping unprocessed older turns.
            run_one_summary_job(context_session_factory, target_session_id=session_pk, force=True)
            db.expire_all()
            context_session = db.get(ChatSession, session_pk)
            if context_session is None:
                raise ApiError(
                    status_code=409,
                    code="CHAT_REQUEST_CANCELLED",
                    message="本次生成已停止或会话已删除",
                    retryable=True,
                )
            active_context = assemble_chat_context(db, session=context_session, **context_args)
            db.commit()
            if active_context.omitted_history:
                raise ApiError(
                    status_code=503,
                    code="CHAT_CONTEXT_NOT_READY",
                    message="较早的对话尚未整理完成，请稍后重试；聊天记录已保留",
                    retryable=True,
                )
            if not refresh_generation_lease(
                db,
                user_id=user_id,
                request_id=req.request_id,
                generation_token=generation_token,
            ):
                raise ApiError(
                    status_code=409,
                    code="CHAT_REQUEST_CANCELLED",
                    message="本次生成已停止",
                    retryable=True,
                )
            yield event({"type": "context_ready"})
        private_context = has_attachment_context or bool(
            getattr(active_context, "attachment_derived", False)
        )
        explicit_search = bool(
            re.search(
                r"联网|上网|搜索|查找公开|查阅公开|\b(?:search|browse|look up)\b",
                model_user_input,
                re.I,
            )
        )
        for payload in iter_web_search(
            web_mode="off" if private_context and not explicit_search else req.web_mode,
            model_id=model_id,
            user_input=model_user_input,
            context_messages=[] if private_context else active_context.messages,
            request_id=req.request_id,
            user_id=user_id,
            check_active=check_active,
            reserve_search=reserve_search,
        ):
            check_active()
            if "web" in payload:
                web = deepcopy(payload["web"])
                persist_web()
            # Evidence fitting may shorten sources. Publish their candidate
            # snapshot only once it matches the payload sent to the model.
            if payload["type"] != "web_sources":
                yield web_event(payload)
        if req.kind == "qa":
            previous_warnings = len(web.get("warnings", []))
            active_context, web = apply_web_context(active_context, web, model_id)
            if attachment_evidence:
                web["sources"] = [*web.get("sources", []), *attachment_evidence.sources]
            persist_web()
            for warning in web.get("warnings", [])[previous_warnings:]:
                yield web_event({"type": "web_warning", "warning": warning, "web": web})
        elif attachment_evidence:
            web["sources"] = attachment_evidence.sources
            persist_web()
        if attachment_evidence and attachment_evidence.retrieval_metrics:
            web.setdefault("metrics", {})["knowledge_retrieval"] = (
                attachment_evidence.retrieval_metrics
            )
            web.setdefault("warnings", []).extend(attachment_evidence.warnings)
            persist_web()
            for warning in attachment_evidence.warnings:
                yield web_event({"type": "web_warning", "warning": warning, "web": web})
        check_active()
        if getattr(active_context, "attachment_derived", False):
            if not refresh_generation_lease(
                db,
                user_id=user_id,
                request_id=req.request_id,
                generation_token=generation_token,
                attachment_derived=True,
            ):
                check_active()
        yield web_event({"type": "web_status", "status": web["status"], "web": web})
        yield web_event({"type": "web_sources", "web": web, "final": False})
        input_tokens = active_context.input_tokens

        def start_answer(control):
            return chat_stream(
                messages=active_context.history,
                node_label=node_label,
                node_sub=node_sub,
                user_input=model_user_input,
                mode=req.mode,
                ai_style=req.ai_style,
                kind=req.kind,
                memories=active_context.memories,
                model_id=model_id,
                prepared_messages=active_context.messages,
                on_stream=control.attach,
                **({"timeout": max(0.1, deadline - monotonic())} if has_attachment_context else {}),
                on_usage=lambda usage: log.info(
                    "chat_token_usage request=%s estimated_input=%s input_delta=%s usage=%s",
                    req.request_id,
                    input_tokens,
                    (usage["prompt_tokens"] - input_tokens)
                    if isinstance(usage.get("prompt_tokens"), int)
                    else None,
                    {
                        key: value
                        for key, value in usage.items()
                        if key in {"prompt_tokens", "completion_tokens", "total_tokens"}
                        and isinstance(value, int)
                        and not isinstance(value, bool)
                    },
                ),
            )

        last_guard = perf_counter()

        def check_answer_active():
            nonlocal last_guard
            now = perf_counter()
            if now - last_guard >= 0.2:
                check_active()
                last_guard = now

        stream = cancellable_chat_stream(
            start_answer,
            check_answer_active,
            **(
                {"timeout_seconds": max(0.1, deadline - monotonic())}
                if has_attachment_context
                else {}
            ),
        )
        for chunk in stream:
            if first_chunk:
                check_active()
            full_text.append(chunk)
            now = perf_counter()
            if first_chunk or now - checkpoint >= 0.5:
                if not refresh_generation_lease(
                    db,
                    user_id=user_id,
                    request_id=req.request_id,
                    generation_token=generation_token,
                    content="".join(full_text),
                    web=web,
                ):
                    raise ApiError(
                        status_code=409,
                        code="CHAT_REQUEST_CANCELLED",
                        message="本次生成已停止或会话内容已改变",
                        retryable=True,
                    )
                checkpoint = now
            if first_chunk:
                log.info(
                    "chat_first_token request=%s latency_ms=%d",
                    req.request_id,
                    round((now - began) * 1000),
                )
                first_chunk = False
            yield event({"text": chunk})
        content = "".join(full_text)
        check_active()
        if not content.strip():
            raise ApiError(
                status_code=502,
                code="AI_EMPTY_RESPONSE",
                message="模型未返回可用回答，请重新生成",
                retryable=True,
            )
        invalid_citations = invalid_source_ids(content, web.get("sources", []))
        if invalid_citations:
            warning = {
                "code": "WEB_CITATION_INVALID",
                "message": "部分引用没有对应的检索来源，已禁用这些引用链接。",
                "retryable": False,
            }
            web.setdefault("warnings", []).append(warning)
            web.setdefault("metrics", {})["invalid_citations"] = len(invalid_citations)
            yield web_event({"type": "web_warning", "warning": warning, "web": web})
        saved = finish_chat_turn(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            content=content,
            status="complete",
            web=web,
        )
        if not saved:
            raise ApiError(
                status_code=409,
                code="CHAT_REQUEST_CANCELLED",
                message="本次生成已停止或会话内容已改变",
                retryable=True,
            )
        terminal = True
        web["cited_source_ids"] = cited_source_ids(content, web.get("sources", []))
        policy = get_context_policy(model_id)
        if (
            active_context.summary_needed
            or input_tokens + count_messages([{"role": "assistant", "content": content}], model_id)
            >= policy.summary_trigger_tokens
        ):
            try:
                schedule_chat_summary(db, session_id=session_pk, model_id=model_id)
            except Exception as error:
                db.rollback()
                log.warning(
                    "chat_summary_schedule_failed session=%s error_type=%s",
                    session_pk,
                    type(error).__name__,
                )
        yield web_event({"type": "web_sources", "web": web, "final": True})
        yield event({"request_state": {"status": "complete"}})
        yield "data: [DONE]\n\n"
    except GeneratorExit:
        finish_chat_turn(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            content="".join(full_text),
            status="interrupted",
            error_code="CLIENT_DISCONNECTED",
            web=web,
        )
        checkpoint_interrupted_content(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            content="".join(full_text),
        )
        raise
    except Exception as error:
        known_error = isinstance(error, (ApiError, ChatStreamError))
        code = error.code if known_error else "AI_STREAM_ERROR"
        message = error.message if known_error else "模型服务暂时不可用，请重试"
        retryable = error.retryable if known_error else True
        if isinstance(error, ContextWindowExceeded):
            code = "CHAT_CONTEXT_TOO_LARGE"
            message = str(error)
            retryable = False
        incomplete = code in {"AI_OUTPUT_LIMIT", "AI_STREAM_INCOMPLETE"}
        log.warning(
            "chat_stream_failed request=%s code=%s error_type=%s",
            req.request_id,
            code,
            type(error).__name__,
        )
        finish_chat_turn(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            content="".join(full_text),
            status="interrupted" if incomplete else "failed",
            error_code=code,
            web=web,
        )
        checkpoint_interrupted_content(
            db,
            user_id=user_id,
            request_id=req.request_id,
            generation_token=generation_token,
            content="".join(full_text),
        )
        current_turn = get_chat_turn(db, user_id=user_id, request_id=req.request_id)
        status = (
            "interrupted"
            if current_turn is None or current_turn.status in {"interrupted", "deleted"}
            else "failed"
        )
        saved_message = (
            db.query(ChatMessage)
            .filter_by(id=ids["ai"], user_id=user_id)
            .populate_existing()
            .one_or_none()
        )
        saved_web = (
            deepcopy((saved_message.metadata_json or {}).get("web")) if saved_message else None
        )
        if saved_web is not None:
            from services.attachments.evidence import hydrate_message_sources

            saved_web["sources"] = hydrate_message_sources(
                db, user_id=user_id, messages=[saved_message]
            ).get(saved_message.id, [])
        db.commit()
        if saved_web is not None:
            yield web_event({"type": "web_sources", "web": saved_web, "final": True})
        yield event({"request_state": {"status": status}})
        yield event({"error": {"code": code, "message": message, "retryable": retryable}})
        yield "data: [DONE]\n\n"
    finally:
        close = getattr(stream, "close", None)
        if close:
            close()
        if not terminal:
            db.rollback()
