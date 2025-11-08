from fastapi import FastAPI
app = FastAPI()

@app.get("/api/fast")
def fast_endpoint():
    return {"ok": True} 