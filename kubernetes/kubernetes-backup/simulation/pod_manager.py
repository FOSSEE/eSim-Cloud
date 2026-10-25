from kubernetes import client, config

# Load kubernetes config
config.load_kube_config()

v1 = client.CoreV1Api()

def create_simulation_pod(user_id):
    pod = client.V1Pod(
        metadata=client.V1ObjectMeta(
            name=f"simulation-{user_id}",
            labels={"user": user_id, "app": "simulation"}
        ),
        spec=client.V1PodSpec(
            restart_policy="Never",
            containers=[
                client.V1Container(
                    name="simulation",
                    image="esim-simulation:latest",
                    resources=client.V1ResourceRequirements(
                        limits={"memory": "512Mi", "cpu": "1"},
                        requests={"memory": "256Mi", "cpu": "0.5"}
                    )
                )
            ]
        )
    )
    v1.create_namespaced_pod(namespace="default", body=pod)
    print(f"Pod created for user {user_id}")

def delete_simulation_pod(user_id):
    v1.delete_namespaced_pod(
        name=f"simulation-{user_id}",
        namespace="default"
    )
    print(f"Pod deleted for user {user_id}")

def get_pod_status(user_id):
    pod = v1.read_namespaced_pod(
        name=f"simulation-{user_id}",
        namespace="default"
    )
    return pod.status.phase