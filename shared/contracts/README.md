# Shared contracts

Reserved for the language-neutral API contract used by Swift and TypeScript clients. The implemented FastAPI backend will produce an OpenAPI specification; reviewed contract exports belong here.

Generate the specification from the actual backend rather than maintaining a second, conflicting definition. Client generation and API versioning will be chosen when the API is designed.

SwiftUI and React keep separate UI source. This directory contains no product models or endpoint definitions yet.
