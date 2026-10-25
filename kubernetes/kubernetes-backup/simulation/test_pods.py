from pod_manager import create_simulation_pod, delete_simulation_pod, get_pod_status
import time

# Simulate 3 users starting simulations at the same time
users = ["user1", "user2", "user3"]

# Create pods for all users
for user in users:
    create_simulation_pod(user)

time.sleep(5)

# Check status of all pods
for user in users:
    status = get_pod_status(user)
    print(f"{user} pod status: {status}")

# Clean up all pods
for user in users:
    delete_simulation_pod(user)