from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        retryable: bool | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retryable = retryable

    def payload(self) -> dict[str, str | bool]:
        payload: dict[str, str | bool] = {"code": self.code, "message": self.message}
        if self.retryable is not None:
            payload["retryable"] = self.retryable
        return payload


async def api_error_handler(_request: Request, error: ApiError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content=error.payload())


def install_api_error_handler(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, api_error_handler)
