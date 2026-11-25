#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-deploy}"
case "$MODE" in
  deploy|--render) ;;
  *) printf 'Usage: %s [--render]\n' "$0" >&2; exit 1 ;;
esac
command -v python3 >/dev/null || { echo 'python3 is required.' >&2; exit 1; }
DOMAIN="${DOMAIN:-}"
if [[ -z "$DOMAIN" ]]; then
  read -r -p 'Domain (e.g. newsletter.example.com): ' DOMAIN
fi
export DOMAIN
export NAMESPACE="${NAMESPACE:-newsletter}"
export IMAGE="${IMAGE:-ghcr.io/pec1985/newsletter:latest}"
export INGRESS_CLASS="${INGRESS_CLASS:-public}"
export CLUSTER_ISSUER="${CLUSTER_ISSUER:-letsencrypt-prod}"
export IMAGE_PULL_SECRET="${IMAGE_PULL_SECRET-registry-credentials}"
export APP_ORIGIN="https://${DOMAIN}"
# A new revision rolls pods on every deployment, refreshing secrets and mutable tags.
export CONFIG_REVISION="$(python3 -c 'import uuid; print(uuid.uuid4())')"

umask 077
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT
python3 - "$SCRIPT_DIR" "$TMP_DIR" <<'PYTHON'
import json, os, pathlib, re, sys
source, target = map(pathlib.Path, sys.argv[1:])
values = dict(os.environ)
label = r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
domain = values['DOMAIN']
if len(domain) > 253 or not re.fullmatch(label + r'(?:\.' + label + r')+', domain):
    sys.exit('Domain must be a lowercase DNS hostname, without scheme, port, or path.')
for name in ('NAMESPACE', 'INGRESS_CLASS', 'CLUSTER_ISSUER', 'IMAGE_PULL_SECRET'):
    value = values[name]
    if name == 'IMAGE_PULL_SECRET' and not value:
        continue
    if len(value) > 63 or not re.fullmatch(label, value):
        sys.exit(f'{name} must be a DNS label of at most 63 characters.')
if not values['IMAGE'].startswith('ghcr.io/') or re.search(r'\s', values['IMAGE']):
    sys.exit('IMAGE must be a ghcr.io image reference without whitespace.')
values['IMAGE_PULL_SECRETS'] = ([{'name': values['IMAGE_PULL_SECRET']}] if values['IMAGE_PULL_SECRET'] else [])
for name in ('namespace', 'deployment', 'service', 'ingress'):
    template = (source / f'{name}.yaml').read_text()
    rendered = re.sub(r'\$\{([A-Z_]+)\}', lambda m: json.dumps(values[m[1]]), template)
    (target / f'{name}.yaml').write_text(rendered)
PYTHON

if [[ "$MODE" == '--render' ]]; then
  for resource in namespace deployment service ingress; do
    printf '%s\n' '---'
    cat "$TMP_DIR/$resource.yaml"
  done
  exit 0
fi

command -v kubectl >/dev/null || { echo 'kubectl is required.' >&2; exit 1; }
# Respect explicit KUBECONFIG; otherwise use the inspected MicroK8s config if present.
if [[ -z "${KUBECONFIG:-}" && -f "$HOME/.kube/microk8s-server.yaml" ]]; then
  export KUBECONFIG="$HOME/.kube/microk8s-server.yaml"
fi
KUBE=(kubectl)
if [[ -n "${KUBE_CONTEXT:-}" ]]; then KUBE+=(--context "$KUBE_CONTEXT"); fi
"${KUBE[@]}" cluster-info >/dev/null
"${KUBE[@]}" get ingressclass "$INGRESS_CLASS" >/dev/null
"${KUBE[@]}" wait --for=condition=Ready "clusterissuer/$CLUSTER_ISSUER" --timeout=30s
SECRETS_FILE="${SECRETS_FILE:-$SCRIPT_DIR/secrets.yaml}"
if [[ ! -f "$SECRETS_FILE" ]]; then
  cp "$SCRIPT_DIR/secrets.example.yaml" "$SECRETS_FILE"
  printf 'Created %s. Fill in production values and rerun.\n' "$SECRETS_FILE" >&2
  exit 1
fi
# Parse with kubectl; never print credentials or interpolate their dollar signs.
"${KUBE[@]}" create --dry-run=client -f "$SECRETS_FILE" -o json > "$TMP_DIR/secret.json"
python3 - "$TMP_DIR/secret.json" "$NAMESPACE" <<'PYTHON'
import base64, json, pathlib, re, sys
path = pathlib.Path(sys.argv[1]); obj = json.loads(path.read_text())
if obj.get('kind') != 'Secret' or obj.get('metadata', {}).get('name') != 'newsletter-env':
    sys.exit('Secrets file must contain a single Secret named newsletter-env.')
values = {k: base64.b64decode(v).decode() for k,v in obj.get('data', {}).items()}
values.update(obj.get('stringData', {}))
if not values.get('DATABASE_URL', '').startswith(('postgres://', 'postgresql://')):
    sys.exit('Set DATABASE_URL to a production Postgres connection URL.')
if not re.fullmatch(r'[a-fA-F0-9]{64}', values.get('SETTINGS_ENCRYPTION_KEY', '')):
    sys.exit('Set SETTINGS_ENCRYPTION_KEY to 64 hexadecimal characters.')
obj['metadata']['namespace'] = sys.argv[2]
path.write_text(json.dumps(obj))
PYTHON
if [[ -n "$IMAGE_PULL_SECRET" ]]; then
  "${KUBE[@]}" -n "$NAMESPACE" get secret "$IMAGE_PULL_SECRET" -o name >/dev/null
fi
printf 'Deploying %s to https://%s in namespace %s\n' "$IMAGE" "$DOMAIN" "$NAMESPACE"
"${KUBE[@]}" apply -f "$TMP_DIR/namespace.yaml"
# Server-side apply avoids persisting a second copy of credentials in annotations.
"${KUBE[@]}" apply --server-side --field-manager=newsletter-deploy -f "$TMP_DIR/secret.json"
for resource in deployment service ingress; do
  "${KUBE[@]}" apply -f "$TMP_DIR/$resource.yaml"
done
"${KUBE[@]}" -n "$NAMESPACE" rollout status deployment/newsletter --timeout=300s
# Ingress-shim creates the certificate asynchronously.
"${KUBE[@]}" -n "$NAMESPACE" wait --for=create certificate/newsletter-tls --timeout=120s
"${KUBE[@]}" -n "$NAMESPACE" wait --for=condition=Ready certificate/newsletter-tls --timeout=300s
printf 'Deployment and TLS ready: https://%s\n' "$DOMAIN"
