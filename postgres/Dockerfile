FROM postgres:16-alpine
# Remove gosu to eliminate CVE vulnerabilities in the Go-compiled binary.
# Since we run the container as non-root (user 999), gosu is not needed.
RUN rm -f /usr/local/bin/gosu
USER 999
