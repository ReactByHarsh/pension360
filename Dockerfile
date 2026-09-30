FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include=optional --no-fund
COPY apps apps
ARG VITE_OIDC_AUTHORITY
ARG VITE_OIDC_CLIENT_ID
ARG VITE_OIDC_REDIRECT_URI
ARG VITE_OIDC_SCOPE="openid profile pension360"
ENV VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID VITE_OIDC_REDIRECT_URI=$VITE_OIDC_REDIRECT_URI VITE_OIDC_SCOPE=$VITE_OIDC_SCOPE
RUN npm run build

FROM node:24.21.0-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace=@pension360/api --include-workspace-root=false --no-fund && npm cache clean --force
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/migrations ./apps/api/migrations
COPY demo-data ./demo-data
COPY scripts/demo-prepare.mjs ./scripts/demo-prepare.mjs
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","apps/api/dist/server.js"]

FROM nginx:stable-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health/live || exit 1
