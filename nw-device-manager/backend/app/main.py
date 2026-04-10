from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, hosts, import_, ports, regions, reservations, statistics


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="NW Device Manager",
    version="0.1.0",
    lifespan=lifespan,
    root_path="/api",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(regions.router)
app.include_router(hosts.router)
app.include_router(ports.router)
app.include_router(reservations.router)
app.include_router(import_.router)
app.include_router(statistics.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
