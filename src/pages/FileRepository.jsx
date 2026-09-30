import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileUp, Download, Trash2, Search, Star, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import UploadDocumentDialog from '@/components/repository/UploadDocumentDialog';
import FileCard from '@/components/repository/FileCard';

const CATEGORIES = [
  { id: 'training', label: '📚 Training', color: 'bg-blue-100 text-blue-700' },
  { id: 'template', label: '📋 Template', color: 'bg-purple-100 text-purple-700' },
  { id: 'policy', label: '📜 Policy', color: 'bg-red-100 text-red-700' },
  { id: 'guide', label: '📖 Guide', color: 'bg-green-100 text-green-700' },
  { id: 'contract', label: '📄 Contract', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'other', label: '📦 Other', color: 'bg-gray-100 text-gray-700' },
];

export default function FileRepository() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const [showUpload, setShowUpload] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { data: files = [] } = useQuery({
    queryKey: ['file-repository', brokerageId],
    queryFn: () => base44.entities.FileRepository.filter({ brokerage_id: brokerageId }, '-created_date', 200),
    enabled: !!brokerageId,
  });

  const deleteFile = useMutation({
    mutationFn: (id) => base44.entities.FileRepository.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-repository', brokerageId] });
    },
  });

  const toggleFeatured = useMutation({
    mutationFn: ({ id, isFeatured }) => {
      return base44.entities.FileRepository.update(id, { is_featured: !isFeatured });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-repository', brokerageId] });
    },
  });

  const filteredFiles = files.filter(file => {
    const matchesCategory = selectedCategory === 'all' || file.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      file.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const featuredFiles = filteredFiles.filter(f => f.is_featured);
  const regularFiles = filteredFiles.filter(f => !f.is_featured);

  const handleDownload = async (file) => {
    await base44.entities.FileRepository.update(file.id, { 
      downloads_count: (file.downloads_count || 0) + 1 
    });
    queryClient.invalidateQueries({ queryKey: ['file-repository', brokerageId] });
    window.open(file.file_url, '_blank');
  };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <FileUp className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">File Repository</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Access training materials, templates, and important documents</p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowUpload(true)} className="gap-2 rounded-xl h-11">
              <FileUp className="w-4 h-4" /> Upload Document
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search documents, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl h-10"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-xl whitespace-nowrap text-sm font-medium transition-all ${
                selectedCategory === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted'
              }`}
            >
              All Files
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-xl whitespace-nowrap text-sm font-medium transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Featured Files */}
      {featuredFiles.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-yellow-500 fill-current" />
            <h2 className="text-lg font-semibold text-foreground">Featured Documents</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredFiles.map((file, i) => (
              <FileCard
                key={file.id}
                file={file}
                isAdmin={isAdmin}
                onDownload={() => handleDownload(file)}
                onDelete={() => deleteFile.mutate(file.id)}
                onToggleFeatured={() => toggleFeatured.mutate({ id: file.id, isFeatured: file.is_featured })}
                index={i}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Files */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {selectedCategory === 'all' ? 'All Documents' : CATEGORIES.find(c => c.id === selectedCategory)?.label}
          <span className="text-muted-foreground text-sm font-normal ml-2">({regularFiles.length})</span>
        </h2>
        {regularFiles.length === 0 ? (
          <div className="text-center py-16">
            <FileUp className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground">No documents found</p>
            {isAdmin && (
              <Button onClick={() => setShowUpload(true)} variant="outline" className="mt-4 gap-2 rounded-xl">
                <FileUp className="w-4 h-4" /> Upload your first document
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {regularFiles.map((file, i) => (
              <FileCard
                key={file.id}
                file={file}
                isAdmin={isAdmin}
                onDownload={() => handleDownload(file)}
                onDelete={() => deleteFile.mutate(file.id)}
                onToggleFeatured={() => toggleFeatured.mutate({ id: file.id, isFeatured: file.is_featured })}
                index={i}
              />
            ))}
          </div>
        )}
      </div>

      <UploadDocumentDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        brokerageId={brokerageId}
        user={user}
      />
    </div>
  );
}