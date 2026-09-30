import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tag, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function TagButton({ tags = [], onTagsChange }) {
  const [open, setOpen] = useState(false);

  const availableTags = [
    { value: 'urgent', label: 'Urgent', color: 'bg-destructive/15 text-destructive border-destructive/30' },
    { value: 'high_priority', label: 'High Priority', color: 'bg-chart-4/15 text-chart-4 border-chart-4/30' },
  ];

  const toggleTag = (tagValue) => {
    if (tags.includes(tagValue)) {
      onTagsChange(tags.filter(t => t !== tagValue));
    } else {
      onTagsChange([...tags, tagValue]);
    }
  };

  const removeTag = (tagValue) => {
    onTagsChange(tags.filter(t => t !== tagValue));
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tags.map((tag) => {
        const tagConfig = availableTags.find(t => t.value === tag);
        return (
          <Badge
            key={tag}
            className={`gap-1.5 py-1 px-2 border cursor-pointer hover:opacity-80 transition-opacity ${tagConfig.color}`}
            onClick={() => removeTag(tag)}
          >
            {tagConfig.label}
            <X className="w-3 h-3" />
          </Badge>
        );
      })}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs h-7">
            <Tag className="w-3 h-3" />
            Add Tag
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          {availableTags.map((tag) => (
            <DropdownMenuItem
              key={tag.value}
              onClick={() => toggleTag(tag.value)}
              className="cursor-pointer"
            >
              <span className="flex items-center gap-2">
                {tags.includes(tag.value) && <span className="text-primary">✓</span>}
                {tag.label}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}