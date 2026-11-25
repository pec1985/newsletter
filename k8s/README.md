# Kubernetes deployment

The templates match the inspected MicroK8s cluster: `public` is an NGINX ingress class, cert-manager is installed, and `letsencrypt-prod` is ready with an HTTP-01 solver using `public`. The script reuses these resources.

1. Point the domain's DNS A/AAAA records at your ingress server and ensure ports 80 and 443 reach NGINX. Do not use the `127.0.0.1` address reported by the existing ingresses as public DNS.
2. Fill in `k8s/secrets.yaml` using `secrets.example.yaml`. The local file is ignored by Git; a fresh checkout creates a placeholder on the first deploy attempt. Use a reachable production Postgres database and a stable encryption key generated with `rtk openssl rand -hex 32`.
3. Run `rtk ./k8s/deploy.sh` from the repository root and enter the domain when prompted.

The script defaults to `~/.kube/microk8s-server.yaml` when available. Set `KUBECONFIG` and optionally `KUBE_CONTEXT` to override it. It applies the namespace, environment Secret, Deployment, Service and TLS Ingress, then waits for the rollout and certificate. Each run refreshes pods so changes to secrets and the mutable `latest` image take effect. Failed waits exit nonzero; applied resources remain for inspection.

Preview without any cluster access or secrets output:

```bash
rtk env DOMAIN=newsletter.example.com ./k8s/deploy.sh --render
```

Options are environment variables: `DOMAIN`, `NAMESPACE` (default `newsletter`), `IMAGE` (default `ghcr.io/pec1985/newsletter:latest`), `INGRESS_CLASS` (default `public`), `CLUSTER_ISSUER` (default `letsencrypt-prod`), `IMAGE_PULL_SECRET`, and `SECRETS_FILE`. Use an immutable `sha-…` tag or digest for reproducible deployments. The repository's container workflow publishes the image on main pushes.

The script defaults to the `registry-credentials` image pull secret used by the newsletter cluster. For a new namespace, create the namespace and a `kubernetes.io/dockerconfigjson` secret with package read access before deploying. Set `IMAGE_PULL_SECRET` to use a different secret name, or set `IMAGE_PULL_SECRET=''` for an anonymous pull of a public image.

`ORIGIN` and `APP_ORIGIN` are set to `https://<domain>` by the Deployment. Other application environment variables belong in the ignored Secret. Secret values are not template-expanded. TCP probes check the web server, not database connectivity.

Each newsletter pod runs the web app and an `email-worker` container. The worker starts polling the production queue as soon as it starts. To follow its logs in the default namespace, run `rtk kubectl -n newsletter logs -f deployment/newsletter -c email-worker` using the deployment's kubeconfig and context.

Prepare PostgreSQL and apply schema migrations before deployment. Knowledge indexing requires a separate worker.

Cert-manager integration follows [annotated Ingress resources](https://cert-manager.io/docs/usage/ingress/) and the existing issuer's [HTTP-01 configuration](https://cert-manager.io/docs/configuration/acme/http01/).
