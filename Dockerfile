FROM node:18-bullseye

WORKDIR /app

RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/root/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

COPY package.json bun.lockb ./

RUN bun install

COPY . .

CMD ["bun", "dev"]