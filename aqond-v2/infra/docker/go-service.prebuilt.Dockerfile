# Host-built Linux binary only — no golang compile inside Docker (stable on low-RAM Desktop).
# Build context directory must contain a file named "service" (the static binary).
ARG PORT=8080
FROM gcr.io/distroless/static-debian12:nonroot
ARG PORT
WORKDIR /
COPY service /service
USER nonroot:nonroot
EXPOSE ${PORT}
ENTRYPOINT ["/service"]
