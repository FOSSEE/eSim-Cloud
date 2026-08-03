# ── Stage 1: build Icarus Verilog against the alpine3.13 toolchain ──
# The prebuilt edge/community iverilog needs a newer libstdc++ than
# alpine3.13 ships ("Error relocating /usr/lib/ivl/ivl"), and upgrading
# libstdc++/libgcc from edge conflicts with the build-base packages the
# main image keeps installed. Compiling from source with the matching
# GCC-10/musl toolchain sidesteps both problems.
FROM alpine:3.13 AS iverilog-builder
RUN apk add --no-cache build-base flex bison gperf zlib-dev autoconf wget
RUN wget -q -O /tmp/iverilog.tar.gz \
        https://github.com/steveicarus/iverilog/archive/refs/tags/v12_0.tar.gz \
    && tar -xzf /tmp/iverilog.tar.gz -C /tmp \
    && cd /tmp/iverilog-12_0 \
    && sh autoconf.sh \
    && ./configure --prefix=/opt/iverilog \
    && make -j"$(nproc)" \
    && make install

# ── Stage 2: build NVC (VHDL simulator) against the same toolchain ──
# --disable-llvm uses NVC's built-in JIT, avoiding an LLVM dependency.
FROM alpine:3.13 AS nvc-builder
RUN apk add --no-cache build-base zlib-dev libffi-dev zstd-dev \
        elfutils-dev pkgconfig flex bison wget
RUN wget -q -O /tmp/nvc.tar.gz \
        https://github.com/nickg/nvc/releases/download/r1.11.2/nvc-1.11.2.tar.gz \
    && tar -xzf /tmp/nvc.tar.gz -C /tmp \
    && mkdir /tmp/nvc-build && cd /tmp/nvc-build \
    && /tmp/nvc-1.11.2/configure --disable-llvm --prefix=/opt/nvc \
    && make -j"$(nproc)" \
    && make install

FROM python:3.7-alpine3.13

ENV PYTHONUNBUFFERED 1
ENV PYTHONDONTWRITEBYTECODE 1

RUN mkdir /code
WORKDIR /code

ENV NGSPICE_VERSION 31

RUN apk add --no-cache --virtual .build-deps \
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
    && apk del .build-deps

# Arduino Cli and Compiling tools
RUN apk add \
        wget \
        tar \
        ca-certificates \
        gcc-avr \
        binutils \
        avr-libc \
        ctags

ENV USER=root

RUN wget -O /tmp/cli.tar.gz \
        https://downloads.arduino.cc/arduino-cli/arduino-cli_0.10.0_Linux_64bit.tar.gz && \
    cd /tmp && \
    mkdir arduino && \
    tar -xvf /tmp/cli.tar.gz && \
    mv /tmp/arduino-cli /usr/bin/arduino-cli && \
    rm /tmp/cli.tar.gz

RUN arduino-cli core update-index \
	&& arduino-cli core install arduino:avr \
    && arduino-cli lib install Servo \
    && arduino-cli lib install Stepper \
    && arduino-cli lib install LiquidCrystal \
    && cd /root/.arduino15/ \
    && find / -name platform.txt -exec sed -i "s/^compiler.path=.*$/compiler.path=/g" {} \; \
    && find . -name ctags -exec ln -nsf /usr/bin/ctags {} \;


RUN apk add --no-cache libxt jpeg-dev zlib-dev libxaw-dev libx11-dev libtool mariadb-connector-c-dev libffi-dev postgresql-dev

COPY requirements.txt /code/
RUN apk add --no-cache mariadb-connector-c-dev ;\
    apk add --update alpine-sdk && \
    apk add libffi-dev openssl-dev && \
    apk --no-cache --update add build-base ;\
    apk add --no-cache --virtual .build-deps gcc python3-dev musl-dev mariadb-dev\
    && pip install --upgrade pip\
    && pip install --trusted-host pypi.python.org -r requirements.txt \
    && apk del .build-deps

# Icarus Verilog built in stage 1 against this exact alpine version.
# libstdc++ from the stock 3.13 repo satisfies its runtime link.
COPY --from=iverilog-builder /opt/iverilog /opt/iverilog
RUN apk add --no-cache libstdc++ zlib \
    && ln -sf /opt/iverilog/bin/* /usr/local/bin/
# NVC (VHDL) built in stage 2; runtime libs from the stock 3.13 repo.
COPY --from=nvc-builder /opt/nvc /opt/nvc
RUN apk add --no-cache elfutils libelf libffi zstd-libs xz-libs libbz2 \
        fts libgcc \
    && ln -sf /opt/nvc/bin/nvc /usr/local/bin/nvc
