FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# Apply migrations, then serve on the port the host provides (Render sets PORT).
CMD ["sh", "-c", "flask --app app db upgrade && exec gunicorn -b 0.0.0.0:${PORT:-8000} -w 1 --threads 4 app:app"]