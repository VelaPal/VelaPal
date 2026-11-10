FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 ai
COPY --chown=ai:ai velapal_ai ./velapal_ai
RUN mkdir -p /app/data && chown ai:ai /app/data
USER ai
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "velapal_ai.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
