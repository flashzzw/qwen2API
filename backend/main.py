import logging
import os
import sys

# 将项目根目录加入到 sys.path，解决直接运行 main.py 时找不到 backend 模块的问题
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app_factory import create_app
from backend.core.config import settings
from backend.core.request_logging import configure_logging

configure_logging(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=settings.PORT, workers=1)
