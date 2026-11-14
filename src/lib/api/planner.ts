import { apiClient, isMockModeEnabled } from './client';
import { ApplicationTask } from './types';
import { MOCK_TASKS } from './mockAdapter';

let localTasks: ApplicationTask[] = [...MOCK_TASKS];

export async function getTasks(): Promise<ApplicationTask[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([...localTasks]);
  }
  return apiClient<ApplicationTask[]>('/api/v1/tasks');
}

export async function createTask(task: Omit<ApplicationTask, 'id'>): Promise<ApplicationTask> {
  if (isMockModeEnabled()) {
    const newTask: ApplicationTask = {
      ...task,
      id: `task-${Date.now()}`,
    };
    localTasks.unshift(newTask);
    return Promise.resolve(newTask);
  }
  return apiClient<ApplicationTask>('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  });
}

export async function updateTaskStatus(id: string, status: ApplicationTask['status']): Promise<ApplicationTask> {
  if (isMockModeEnabled()) {
    const t = localTasks.find((item) => item.id === id);
    if (t) {
      t.status = status;
      return Promise.resolve(t);
    }
    return Promise.resolve(localTasks[0]);
  }
  return apiClient<ApplicationTask>(`/api/v1/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteTask(id: string): Promise<{ success: boolean }> {
  if (isMockModeEnabled()) {
    localTasks = localTasks.filter((t) => t.id !== id);
    return Promise.resolve({ success: true });
  }
  return apiClient<{ success: boolean }>(`/api/v1/tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
