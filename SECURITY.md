# Security Policy

## Supported Versions

Security fixes are released for the latest published version of `galaxy-nodes`.
If you are using an older version, upgrade before reporting a vulnerability unless
the issue also reproduces on the latest release.

## Reporting a Vulnerability

Please report suspected vulnerabilities through GitHub private vulnerability
reporting for this repository. If private reporting is unavailable, open a
GitHub issue with a non-sensitive summary and do not include exploit details,
tokens, private URLs, or affected customer data.

Include:

- The affected package version or commit SHA.
- A minimal reproduction or clear description of the vulnerable behavior.
- Browser, bundler, and operating system details when relevant.
- Whether the issue affects consumer-supplied graph data, image URLs, or remote
  graph loading callbacks.

You should receive an initial response within 7 days. Confirmed vulnerabilities
will be fixed privately when practical, then disclosed with release notes after a
patched version is available.

## Consumer-Supplied URLs

Galaxy Nodes can render consumer-provided node image URLs as WebGL textures. Host
applications remain responsible for validating allowed image origins, setting an
appropriate Content Security Policy, and avoiding secrets in image URLs.
