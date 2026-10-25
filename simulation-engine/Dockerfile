# Stage 1: Build ngspice
FROM alpine:3.14 AS builder

RUN apk add --no-cache \
    autoconf \
    automake \
    bison \
    flex \
    g++ \
    libtool \
    make \
    curl \
    tar

ENV NGSPICE_VERSION 31
RUN curl -fSL https://github.com/imr/ngspice/archive/ngspice-$NGSPICE_VERSION.tar.gz -o ngspice.tar.gz \
    && mkdir -p /usr/src \
    && tar -zxC /usr/src -f ngspice.tar.gz \
    && cd /usr/src/ngspice-ngspice-$NGSPICE_VERSION \
    && ./autogen.sh \
    && ./configure --with-x=no --with-readline=no --disable-xspice --disable-cider --disable-gpu --disable-openmp \
    && make -j$(nproc) \
    && make install

# Stage 2: Final image
FROM alpine:3.14

# Install python and minimal runtime libs for ngspice
RUN apk add --no-cache python3 libstdc++

COPY --from=builder /usr/local/bin/ngspice /usr/local/bin/ngspice
COPY --from=builder /usr/local/share/ngspice /usr/local/share/ngspice

WORKDIR /app
COPY simulate.py .

# Create a non-root user for security
RUN adduser -D simuser && \
    mkdir -p /tmp/simulation_run && \
    chown simuser:simuser /tmp/simulation_run

USER simuser

# Default command if no arguments are provided
ENTRYPOINT ["python3", "simulate.py"]
