# Node 20 base image maintained by Apify.
FROM apify/actor-node:20

# Install production dependencies first so the layer is cached.
COPY package*.json ./
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional --no-audit --no-fund \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

COPY . ./

CMD npm start --silent
