FROM python:3.7-alpine3.16

ENV PYTHONUNBUFFERED 1
ENV PYTHONDONTWRITEBYTECODE 1

RUN mkdir /code
WORKDIR /code

ENV NGSPICE_VERSION 31

# ── Build deps for ngspice (removed after compile) ──────────────────────────
RUN apk add --no-cache --virtual .ngspice-build-deps \
    autoconf \
    automake \
    bison \
    curl \
    flex \
    g++ \
    libx11-dev \
    libxaw-dev \
    libtool \
    make

RUN curl -fSL https://github.com/imr/ngspice/archive/ngspice-$NGSPICE_VERSION.tar.gz -o ngspice.tar.gz \
    && mkdir -p /usr/src \
    && tar -zxC /usr/src -f ngspice.tar.gz \
    && rm ngspice.tar.gz \
    && cd /usr/src/ngspice-ngspice-$NGSPICE_VERSION \
    && ./autogen.sh \
    && ./configure \
    && make \
    && make install \
    && apk del .ngspice-build-deps

# ── Arduino CLI and AVR toolchain ───────────────────────────────────────────
RUN apk add --no-cache \
        wget \
        tar \
        ca-certificates \
        gcc-avr \
        binutils \
        avr-libc \
        ctags

ENV USER=root

# Upgraded from 0.10.0 (2019) whose package index URLs are stale
RUN wget -O /tmp/cli.tar.gz \
        https://downloads.arduino.cc/arduino-cli/arduino-cli_0.35.3_Linux_64bit.tar.gz && \
    cd /tmp && \
    tar -xvf /tmp/cli.tar.gz && \
    mv /tmp/arduino-cli /usr/bin/arduino-cli && \
    rm /tmp/cli.tar.gz

# Non-fatal: a network blip during image build must not block the backend.
# The arduino-cli setup is only needed for the Arduino simulator frontend.
RUN arduino-cli core update-index \
    && arduino-cli core install arduino:avr \
    && arduino-cli lib install Servo \
    && arduino-cli lib install Stepper \
    && arduino-cli lib install LiquidCrystal \
    && cd /root/.arduino15/ \
    && find / -name platform.txt -exec sed -i "s/^compiler.path=.*$/compiler.path=/g" {} \; \
    && find . -name ctags -exec ln -nsf /usr/bin/ctags {} \; \
    || echo "[WARN] arduino-cli setup failed — Arduino simulator will be unavailable"

# ── Runtime system libraries ─────────────────────────────────────────────────
# Note: In Alpine 3.18 the MariaDB client library is 'mariadb-connector-c'
#       and the dev headers are 'mariadb-connector-c-dev'.
#       'mariadb-dev' is a separate meta-package that pulls in the server libs;
#       we only need the client headers for mysqlclient/PyMySQL, so we omit it.
RUN apk add --no-cache \
    libxt \
    jpeg-dev \
    zlib-dev \
    libxaw-dev \
    libx11-dev \
    libtool \
    mariadb-connector-c-dev \
    libffi-dev \
    postgresql-dev \
    cairo \
    cairo-dev \
    pango \
    gdk-pixbuf

# ── Python dependencies ──────────────────────────────────────────────────────
COPY requirements.txt /code/

RUN apk add --no-cache --virtual .pip-build-deps \
        gcc \
        python3-dev \
        musl-dev \
        mariadb-connector-c-dev \
        alpine-sdk \
        openssl-dev \
        build-base \
    && pip install --upgrade pip \
    && pip install --trusted-host pypi.python.org -r requirements.txt \
    && apk del .pip-build-deps