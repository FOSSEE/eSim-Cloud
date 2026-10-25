from kubernetes import client, config
import os
# Mock mode for testing without Kubernetes
MOCK_MODE = os.getenv("MOCK_K8S", "false").lower() == "true"

def load_k8s_config():
    """
    Load Kubernetes config.
    Inside cluster = automatic config.
    Local development = kubeconfig file.
    """
    try:
        config.load_incluster_config()
    except:
        config.load_kube_config()


# load_k8s_config()
# v1 = client.CoreV1Api()


def create_simulation_pod(user_id: str, namespace: str = "default"):
    """
    Create a new Kubernetes pod for this user.
    Each user gets their own isolated simulation environment.
    """
    pod_name = f"sim-{user_id[:8]}"
    if MOCK_MODE:
        print(f"[MOCK] Created pod: {pod_name}")
        return pod_name

    load_k8s_config()
    v1 = client.CoreV1Api()
    pod_manifest = {
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {
            "name": pod_name,
            "namespace": namespace,
            "labels": {
                "app": "esim-simulation",
                "user_id": user_id[:8]
            }
        },
        "spec": {
            "containers": [{
                "name": "ngspice",
                "image": "esim-ngspice:latest",  # Person 1 ka image
                "imagePullPolicy": "IfNotPresent",
                "ports": [{"containerPort": 5000}],
                "resources": {
                    "limits": {
                        "cpu": "500m",      # Max 0.5 CPU per user
                        "memory": "256Mi"   # Max 256MB RAM per user
                    },
                    "requests": {
                        "cpu": "100m",
                        "memory": "128Mi"
                    }
                }
            }],
            "restartPolicy": "Never"
        }
    }

    v1.create_namespaced_pod(
        namespace=namespace,
        body=pod_manifest
    )
    return pod_name


def delete_simulation_pod(pod_name: str, namespace: str = "default"):
    """
    Delete pod when simulation ends.
    Frees up resources for other users.
    """
    if MOCK_MODE:
        print(f"[MOCK] Deleted pod: {pod_name}")
        return True
    load_k8s_config()
    v1 = client.CoreV1Api()
    try:
        v1.delete_namespaced_pod(
            name=pod_name,
            namespace=namespace
        )
        return True
    except Exception as e:
        print(f"Error deleting pod {pod_name}: {e}")
        return False


def get_pod_status(pod_name: str, namespace: str = "default"):
    """
    Check if pod is Running, Pending, or Failed.
    """
    if MOCK_MODE:
        print(f"[MOCK] Status for pod: {pod_name}")
        return "Running"
    load_k8s_config()
    v1 = client.CoreV1Api()
    try:
        pod = v1.read_namespaced_pod(
            name=pod_name,
            namespace=namespace
        )
        return pod.status.phase
    except:
        return None


def list_simulation_pods(namespace: str = "default"):
    """
    List all active simulation pods.
    Used by cleanup service.
    """
    load_k8s_config()
    v1 = client.CoreV1Api()
    pods = v1.list_namespaced_pod(
        namespace=namespace,
        label_selector="app=esim-simulation"
    )
    return [pod.metadata.name for pod in pods.items]

