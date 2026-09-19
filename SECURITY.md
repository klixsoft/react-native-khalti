# Security policy

## Supported versions

Only the latest published minor version receives fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub's
"Report a vulnerability" button on the repository's **Security** tab, or email security@klixsoft.com
with a description and steps to reproduce.

You will get an acknowledgement within a few days. Please give us reasonable time to release a fix
before disclosing.

## Handling payment credentials

This library never needs your gateway **secret** keys or private keys in the app. If you find a
code path that would leak or require them on the device, treat it as a vulnerability and report it.
