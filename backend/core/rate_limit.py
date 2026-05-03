import time
from collections import defaultdict, deque
from threading import Lock

# 进程内滑动窗口：足够单实例使用；上多实例需换 Redis
_buckets: dict[str, deque[float]] = defaultdict(deque)
_locks: dict[str, Lock] = defaultdict(Lock)
_global_lock = Lock()

# 登录失败计数：email -> (fail_count, lock_until_ts)
_login_fail: dict[str, tuple[int, float]] = {}

LOGIN_MAX_FAILS = 5
LOGIN_LOCK_SECONDS = 15 * 60


def _get_lock(key: str) -> Lock:
    with _global_lock:
        return _locks[key]


def hit(key: str, max_calls: int, window_seconds: int) -> bool:
    """True = 允许；False = 触发限流。窗口外的旧记录顺手清掉，避免 deque 无限膨胀。"""
    now = time.time()
    cutoff = now - window_seconds
    lock = _get_lock(key)
    with lock:
        q = _buckets[key]
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= max_calls:
            return False
        q.append(now)
        return True


def remaining_seconds(key: str, window_seconds: int) -> int:
    """触发限流后告诉用户还要等多久 —— 取队首到现在的距离。"""
    q = _buckets.get(key)
    if not q:
        return 0
    now = time.time()
    wait = int(q[0] + window_seconds - now)
    return max(wait, 0)


def is_login_locked(email: str) -> int:
    """返回剩余锁定秒数；0 表示未锁。"""
    rec = _login_fail.get(email)
    if not rec:
        return 0
    _, lock_until = rec
    rem = int(lock_until - time.time())
    return rem if rem > 0 else 0


def record_login_fail(email: str) -> int:
    """累加失败次数，达到阈值后写入锁定时间。返回当前失败次数。"""
    now = time.time()
    fails, lock_until = _login_fail.get(email, (0, 0.0))
    if lock_until and now > lock_until:
        fails = 0
    fails += 1
    if fails >= LOGIN_MAX_FAILS:
        lock_until = now + LOGIN_LOCK_SECONDS
    _login_fail[email] = (fails, lock_until)
    return fails


def reset_login_fail(email: str) -> None:
    _login_fail.pop(email, None)
