FROM node:12-slim

LABEL com.github.actions.name="ESLint Action Marine"
LABEL com.github.actions.description="Lint your Typescript projects with inline lint error annotations."
LABEL com.github.actions.icon="code"
LABEL com.github.actions.color="blue"

LABEL version="1.0.0"
LABEL repository="http://github.com/iCrawl/eslint-action-marine"
LABEL homepage="http://github.com/iCrawl/eslint-action-marine"

COPY entrypoint.sh request.js index.js /
ENTRYPOINT ["/entrypoint.sh"]
