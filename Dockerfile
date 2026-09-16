# =========================================
# Étape 1 : build de l'application Angular
# =========================================
# Angular 22 exige Node ^22.22.3 || ^24.15.0 || >=26.0.0.
ARG NODE_VERSION=24.21.0-alpine
ARG NGINX_VERSION=alpine3.22

FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# Copier d'abord les fichiers de dépendances pour profiter du cache Docker.
COPY package.json package-lock.json ./

# `npm ci` garantit une installation reproductible à partir du lockfile.
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

RUN npm run build

# =========================================
# Étape 2 : service des fichiers statiques par nginx
# =========================================

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runner

# Utilisateur non-root fourni par l'image.
USER nginx

# Configuration nginx et en-têtes de sécurité inclus par celle-ci.
COPY nginx.conf /etc/nginx/nginx.conf
COPY security-headers.conf /etc/nginx/security-headers.conf

# Sortie du build : `dist/<projet>/browser`.
COPY --chown=nginx:nginx --from=builder /app/dist/*/browser /usr/share/nginx/html

# Port d'écoute déclaré dans nginx.conf.
EXPOSE 8100

ENTRYPOINT ["nginx", "-c", "/etc/nginx/nginx.conf"]
CMD ["-g", "daemon off;"]
