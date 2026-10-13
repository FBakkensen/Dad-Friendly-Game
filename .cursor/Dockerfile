# Cursor cloud agent image: matches CI (Node 24) and everything `npm run check` needs.
FROM node:24-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg git \
  && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-chrome-stable fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

# Firestore emulator needs Java 21+; bookworm ships 17, so add Temurin 21.
RUN curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /usr/share/keyrings/adoptium.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" > /etc/apt/sources.list.d/adoptium.list \
  && apt-get update && apt-get install -y --no-install-recommends temurin-21-jdk \
  && apt-get purge -y && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME_21_X64=/usr/lib/jvm/temurin-21-jdk-amd64 \
    CHROME_PATH=/usr/bin/google-chrome
