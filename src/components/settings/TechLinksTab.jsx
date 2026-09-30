import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, ExternalLink, Edit2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const CATEGORIES = ['CRM', 'MLS', 'Marketing', 'Transaction Mgmt', 'Communication', 'Finance', 'Training', 'Other'];
const EMOJIS = ['🔗', '🏠', '💼', '📊', '📱', '💬', '🎯', '🔧', '📋', '💰', '📚', '🌐'];

export default function TechLinksTab({ links = [], onSave, saving }) {
  const [localLinks, setLocalLinks] = useState(links);
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newLink, setNewLink] = useState({ label: '', url: '', category: 'Other', icon: '🔗' });

  const handleAdd = () => {
    if (!newLink.label.trim() || !newLink.url.trim()) return;
    let url = newLink.url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const updated = [...localLinks, { id: Date.now().toString(), ...newLink, url }];
    setLocalLinks(updated);
    onSave(updated);
    setNewLink({ label: '', url: '', category: 'Other', icon: '🔗' });
    setShowAdd(false);
  };

  const handleDelete = (id) => {
    const updated = localLinks.filter(l => l.id !== id);
    setLocalLinks(updated);
    onSave(updated);
  };

  const handleEditSave = (id, changes) => {
    const updated = localLinks.map(l => l.id === id ? { ...l, ...changes } : l);
    setLocalLinks(updated);
    onSave(updated);
    setEditingId(null);
  };

  // Group by category
  const grouped = localLinks.reduce((acc, link) => {
    const cat = link.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(link);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Tech Stack & Links</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Manage tools and websites visible to all agents</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2 rounded-xl h-9">
          <Plus className="w-4 h-4" /> Add Link
        </Button>
      </div>

      {/* Add new link form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-muted/50 border border-border rounded-xl p-4 space-y-3"
          >
            <p className="text-sm font-semibold text-foreground">New Link</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Display Name *</Label>
                <Input
                  value={newLink.label}
                  onChange={e => setNewLink({ ...newLink, label: e.target.value })}
                  placeholder="e.g. Follow Up Boss"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">URL *</Label>
                <Input
                  value={newLink.url}
                  onChange={e => setNewLink({ ...newLink, url: e.target.value })}
                  placeholder="e.g. https://app.followupboss.com"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <select
                  value={newLink.category}
                  onChange={e => setNewLink({ ...newLink, category: e.target.value })}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Icon</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      onClick={() => setNewLink({ ...newLink, icon: e })}
                      className={cn('text-lg p-1 rounded transition-all', newLink.icon === e ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted')}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdd} disabled={!newLink.label.trim() || !newLink.url.trim()}>Add</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Links grouped by category */}
      {localLinks.length === 0 && !showAdd ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-3xl mb-3">🔗</p>
          <p className="font-medium text-foreground">No links yet</p>
          <p className="text-sm mt-1">Add your CRM, MLS, and other tools for your agents.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</p>
            <div className="space-y-2">
              {items.map(link => (
                <EditableLinkRow
                  key={link.id}
                  link={link}
                  isEditing={editingId === link.id}
                  onEdit={() => setEditingId(link.id)}
                  onSave={(changes) => handleEditSave(link.id, changes)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => handleDelete(link.id)}
                  categories={CATEGORIES}
                  emojis={EMOJIS}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function EditableLinkRow({ link, isEditing, onEdit, onSave, onCancel, onDelete, categories, emojis }) {
  const [form, setForm] = useState({ label: link.label, url: link.url, category: link.category, icon: link.icon });

  if (isEditing) {
    return (
      <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Name" className="h-8 text-sm" />
          <Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="URL" className="h-8 text-sm" />
          <select
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none"
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex flex-wrap gap-1">
            {emojis.map(e => (
              <button key={e} onClick={() => setForm({ ...form, icon: e })} className={cn('text-base p-0.5 rounded', form.icon === e ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted')}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel} className="h-7 px-2"><X className="w-3 h-3" /></Button>
          <Button size="sm" onClick={() => onSave(form)} className="h-7 px-2"><Check className="w-3 h-3" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:shadow-sm transition-all">
      <span className="text-xl flex-shrink-0">{link.icon || '🔗'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{link.label}</p>
        <p className="text-xs text-muted-foreground truncate">{link.url}</p>
      </div>
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-muted transition-all text-muted-foreground hover:text-foreground">
        <ExternalLink className="w-4 h-4" />
      </a>
      <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-muted transition-all text-muted-foreground hover:text-foreground">
        <Edit2 className="w-4 h-4" />
      </button>
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 transition-all text-destructive">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}