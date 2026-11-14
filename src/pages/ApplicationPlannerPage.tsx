import React, { useEffect, useState } from 'react';
import { getTasks, createTask, updateTaskStatus, deleteTask } from '../lib/api/planner';
import { ApplicationTask, PriorityLevel } from '../lib/api/types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { Skeleton } from '../components/common/Skeleton';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { EmptyState } from '../components/common/EmptyState';

export function ApplicationPlannerPage() {
  const [tasks, setTasks] = useState<ApplicationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newOpportunity, setNewOpportunity] = useState('Bio-X Graduate Interdisciplinary Fellowship');
  const [newDeadline, setNewDeadline] = useState('2026-06-15');
  const [newPriority, setNewPriority] = useState<PriorityLevel>('HIGH');
  const [newCategory, setNewCategory] = useState<ApplicationTask['category']>('DOCUMENT');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTasks();
      setTasks(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve application tasks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleStatus = async (task: ApplicationTask) => {
    const nextStatus =
      task.status === 'COMPLETED'
        ? 'PENDING'
        : task.status === 'PENDING'
        ? 'IN_PROGRESS'
        : 'COMPLETED';
    const updated = await updateTaskStatus(task.id, nextStatus);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const created = await createTask({
      title: newTitle.trim(),
      opportunityTitle: newOpportunity,
      deadline: newDeadline,
      priority: newPriority,
      category: newCategory,
      status: 'PENDING',
    });

    setTasks((prev) => [created, ...prev]);
    setNewTitle('');
    setModalOpen(false);
  };

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter === 'ALL') return true;
    return t.status === statusFilter;
  });

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <ErrorMessage message={error} onRetry={loadData} />
      </div>
    );
  }

  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E4E9F2]">
        <div>
          <h1 className="text-2xl font-bold text-[#0C1946]">Application Task Planner</h1>
          <p className="text-xs text-[#526079] mt-0.5">
            Coordinate verifiable submission checklists, letters of recommendation, and RFP milestone dates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            icon="add_task"
            onClick={() => setModalOpen(true)}
          >
            Add New Task
          </Button>
        </div>
      </div>

      {/* Progress & Metric Header Card */}
      <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
        <div className="space-y-1">
          <span className="text-xs font-bold text-[#0C1946] uppercase tracking-wider">
            Overall Readiness Milestone Progress
          </span>
          <p className="text-xs text-[#526079]">
            {completedCount} of {tasks.length} critical application tasks verified &amp; completed
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-48 bg-[#F6F8FC] h-3 rounded-full overflow-hidden border border-[#E4E9F2]">
            <div
              className="bg-[#245FD2] h-full transition-all duration-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-sm font-bold text-[#0C1946] font-mono">{progressPercent}%</span>
        </div>
      </Card>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-[#E4E9F2]">
          {(['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-[#0C1946] text-white shadow-xs'
                  : 'text-[#526079] hover:text-[#0C1946]'
              }`}
            >
              {st === 'ALL'
                ? `All (${tasks.length})`
                : st === 'PENDING'
                ? `Pending (${tasks.filter((t) => t.status === 'PENDING').length})`
                : st === 'IN_PROGRESS'
                ? `In Progress (${tasks.filter((t) => t.status === 'IN_PROGRESS').length})`
                : `Completed (${completedCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          title="No tasks in this view"
          description="You have completed all tasks in this filter or none have been assigned yet."
          actionLabel="Create Task"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const isCompleted = task.status === 'COMPLETED';
            const isInProgress = task.status === 'IN_PROGRESS';

            return (
              <Card
                key={task.id}
                className={`p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isCompleted ? 'bg-[#F6F8FC]/60 border-[#E4E9F2] opacity-75' : 'bg-white'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <button
                    onClick={() => handleToggleStatus(task)}
                    className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 transition-colors cursor-pointer ${
                      isCompleted
                        ? 'bg-[#137333] border-[#137333] text-white'
                        : isInProgress
                        ? 'bg-[#FEF7E0] border-[#B06000] text-[#B06000]'
                        : 'border-[#E4E9F2] hover:border-[#245FD2]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isCompleted ? 'check' : isInProgress ? 'hourglass_top' : ''}
                    </span>
                  </button>

                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold ${isCompleted ? 'line-through text-[#526079]' : 'text-[#0C1946]'}`}>
                        {task.title}
                      </span>
                      <Badge
                        variant={
                          task.priority === 'HIGH'
                            ? 'INSUFFICIENT'
                            : task.priority === 'MEDIUM'
                            ? 'COBALT'
                            : 'MUTED'
                        }
                        size="sm"
                      >
                        {task.priority} Priority
                      </Badge>
                      <Badge variant="MUTED" size="sm">
                        {task.category}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-[#526079] truncate">
                      {task.opportunityTitle} • Target Deadline: <strong className="text-[#0C1946]">{task.deadline}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <Badge
                    variant={
                      isCompleted ? 'MEETS' : isInProgress ? 'INSUFFICIENT' : 'MUTED'
                    }
                    size="sm"
                  >
                    {task.status.replace('_', ' ')}
                  </Badge>
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="p-1 text-[#526079] hover:text-[#C5221F] rounded cursor-pointer"
                    title="Delete task"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Task Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Application Milestone Task"
        subtitle="Track requirements and faculty submissions toward application deadlines."
      >
        <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-[#0C1946]">Task Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Request project hosting letter from lab PI"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946] focus:outline-none focus:ring-2 focus:ring-[#245FD2]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-[#0C1946]">Associated Opportunity</label>
              <select
                value={newOpportunity}
                onChange={(e) => setNewOpportunity(e.target.value)}
                className="w-full p-2.5 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946]"
              >
                <option>Bio-X Graduate Interdisciplinary Fellowship</option>
                <option>Google PhD Fellowship in Natural Language Processing</option>
                <option>OpenAI Superalignment Research Grant</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-[#0C1946]">Target Deadline</label>
              <input
                type="date"
                required
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
                className="w-full p-2 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-[#0C1946]">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as PriorityLevel)}
                className="w-full p-2 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946]"
              >
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="LOW">Low Priority</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-[#0C1946]">Task Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as ApplicationTask['category'])}
                className="w-full p-2 bg-[#F6F8FC] border border-[#E4E9F2] rounded-lg text-xs text-[#0C1946]"
              >
                <option value="DOCUMENT">Document Export</option>
                <option value="LOR">Letter of Recommendation</option>
                <option value="ESSAY">Research Statement / Essay</option>
                <option value="SUBMISSION">Portal Submission</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E4E9F2]">
            <Button variant="secondary" size="sm" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Task
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
