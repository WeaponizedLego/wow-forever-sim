# Phase 0 engine spike

Reproduces the findings in `packages/engine/README.md`. The pipeline (lane L1) turns this into
`tools/engine-build/` proper.

1. Clone upstream at the pinned commit (`engine.lock.json`) and generate Go protos:
   `protoc -I=./proto --go_opt=Mgoogle/protobuf/descriptor.proto=google.golang.org/protobuf/types/descriptorpb --go_out=./sim/core ./proto/*.proto`
2. Build the WASM: `GOOS=js GOARCH=wasm go build -ldflags "-w -s" -o lib.wasm ./sim/wasm/`
3. Copy `request-builder/main.go` to `cmd/spike/main.go` in the upstream clone, and
   `request-builder/zz_spike_export.go.txt` to `cmd/wowsimcli/cmd/zz_spike_export.go`. Then:
   `go run -tags with_db ./cmd/spike ui/specs/hunter/dps/builds/sv.siml out/sv-request out/sv-statweights`
4. Run it through the WASM in Node:
   `node run-wasm.mjs <goroot>/lib/wasm/wasm_exec.js lib.wasm out/sv-request.json out/sv-result.json`

The request builder loads an upstream preset through the CLI's own loader. It then attaches each
player's `SimDatabase`: equipped items, enchants and suffixes, plus all consumables and spell
effects. It writes the request as binary and as protojson.
