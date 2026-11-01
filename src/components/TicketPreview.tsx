import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { OpenProjectService } from '../services/OpenProjectService';

export default function TicketPreview({ ticketId, onClose }: { ticketId: string, onClose: () => void }) {
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [logTimeValue, setLogTimeValue] = useState('1h');
  const [logComment, setLogComment] = useState('');
  const [opUrl, setOpUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['op_url'], (res) => {
        const url = typeof res.op_url === 'string' ? res.op_url : '';
        setOpUrl(url.replace(/\/$/, ''));
      });
    }
  }, []);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const client = await OpenProjectService.getApiClient();
      const res = await client.get(`/work_packages/${ticketId}`);
      return res.data;
    },
    enabled: !!ticketId
  });

  const { data: activitiesData } = useQuery({
    queryKey: ['ticket_activities', ticketId],
    queryFn: async () => {
      const client = await OpenProjectService.getApiClient();
      const res = await client.get(`/work_packages/${ticketId}/activities`);
      return res.data;
    },
    enabled: !!ticketId
  });

  const comments = (activitiesData as any)?._embedded?.elements?.filter((act: any) => act.details && act.details.length > 0) || [];

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      if (!ticket) return;
      await OpenProjectService.addComment(ticketId, commentText, ticket.lockVersion);
    },
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['ticket_activities', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    }
  });

  const logTimeMutation = useMutation({
    mutationFn: async () => {
      let ptHours = 'PT1H';
      if (logTimeValue === '15m') ptHours = 'PT15M';
      if (logTimeValue === '30m') ptHours = 'PT30M';
      if (logTimeValue === '1h') ptHours = 'PT1H';
      if (logTimeValue === '2h') ptHours = 'PT2H';
      if (logTimeValue === '4h') ptHours = 'PT4H';
      const today = new Date().toISOString().split('T')[0];
      await OpenProjectService.logTime(ticketId, ptHours, logComment, today);
    },
    onSuccess: () => {
      setLogComment('');
      alert('Time logged successfully!');
    }
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const attachment = await OpenProjectService.uploadAttachment(ticketId, file);
      const imageUrl = attachment._links.downloadLocation.href;
      setCommentText(prev => prev + `\n\n![${file.name}](${imageUrl})`);
    }
  });

  if (isLoading) {
    return (
      <div className="flex-1 bg-surface-container-low overflow-auto flex flex-col items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-primary text-[32px]">sync</span>
        <p className="mt-4 text-on-surface-variant font-body-sm">Loading ticket...</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex-1 bg-surface-container-low overflow-auto flex flex-col items-center justify-center text-on-surface-variant">
        Select a ticket to preview
      </div>
    );
  }

  return (
    <div className="flex-1 bg-surface-container-low overflow-auto flex flex-col relative h-full">
      <div className="p-gutter flex-1 pb-32">
        <div className="flex justify-between items-start mb-element-gap-standard">
          <div>
            <span className="text-on-surface-variant font-code-sm text-code-sm uppercase tracking-widest block mb-1">Package #{ticket.id}</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface leading-tight">{ticket.subject}</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors p-1 rounded-full hover:bg-surface-variant">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-element-gap-standard">
          <div className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>label</span>
            <span className="text-[11px] font-bold uppercase">{ticket._links.status.title}</span>
          </div>
          <div className="bg-surface-variant text-on-surface-variant border border-outline-variant px-2 py-1 rounded flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">person</span>
            <span className="text-[11px] font-bold uppercase">{ticket._links.assignee?.title || 'Unassigned'}</span>
          </div>
          <div className="bg-tertiary-container/20 text-tertiary border border-tertiary/20 px-2 py-1 rounded flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">priority_high</span>
            <span className="text-[11px] font-bold uppercase">{ticket._links.priority?.title || 'Normal'}</span>
          </div>
        </div>

        <div className="bg-surface-container p-container-padding rounded-xl border border-outline-variant/30 mb-element-gap-standard">
          <h4 className="font-label-md text-label-md text-on-surface-variant mb-2 uppercase opacity-60">Description</h4>
          <div className="font-body-sm text-body-sm text-on-surface space-y-3 prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                img: ({node, ...props}) => {
                  let src = props.src || '';
                  if (src.startsWith('/')) {
                    src = `${opUrl}${src}`;
                  }
                  return <img {...props} src={src} className="max-w-full h-auto rounded shadow-sm my-2" />
                }
              }}
            >
              {ticket.description?.raw || '*No description provided.*'}
            </ReactMarkdown>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-label-md text-label-md text-on-surface-variant uppercase opacity-60">Activity & Comments</h4>
          {comments.map((comment: any) => (
            <div key={comment.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 shrink-0 border border-primary/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px] text-primary">chat_bubble</span>
              </div>
              <div className="flex-1 bg-surface-variant/50 p-3 rounded-lg border border-outline-variant/20">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[13px] text-on-surface"><span className="font-bold">{comment._links.user.title}</span> added a comment</p>
                  <p className="text-[11px] text-on-surface-variant">{new Date(comment.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-[13px] text-on-surface-variant prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      img: ({node, ...props}) => {
                        let src = props.src || '';
                        if (src.startsWith('/')) {
                          src = `${opUrl}${src}`;
                        }
                        return <img {...props} src={src} className="max-w-full h-auto rounded shadow-sm my-2" />
                      }
                    }}
                  >
                    {comment.details[0].html || comment.details[0].raw || ''}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
          
          <div className="bg-surface-variant/30 p-3 rounded-lg border border-outline-variant/20 mt-4">
            <textarea 
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Write a comment... (Markdown supported)"
              className="w-full bg-surface-container border border-outline-variant rounded p-2 text-[13px] focus:outline-none focus:border-primary text-on-surface min-h-[80px]"
            />
            <div className="flex justify-between items-center mt-2">
              <div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      uploadImageMutation.mutate(e.target.files[0]);
                    }
                  }}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadImageMutation.isPending}
                  className="flex items-center gap-1 text-[12px] text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">{uploadImageMutation.isPending ? 'sync' : 'image'}</span>
                  {uploadImageMutation.isPending ? 'Uploading...' : 'Attach Image'}
                </button>
              </div>
              <button 
                onClick={() => addCommentMutation.mutate()}
                disabled={!commentText.trim() || addCommentMutation.isPending}
                className="bg-primary text-on-primary px-3 py-1.5 rounded font-label-md text-label-md hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">send</span> Post
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-gutter bg-surface-container/95 backdrop-blur border-t border-outline-variant flex flex-col gap-2">
        <div className="flex gap-2">
           {['15m', '30m', '1h', '2h', '4h'].map(time => (
            <button 
              key={time} 
              onClick={() => setLogTimeValue(time)}
              className={`flex-1 py-1 rounded text-xs font-medium transition-colors border ${logTimeValue === time ? 'bg-primary border-primary text-on-primary' : 'bg-surface-variant border-outline-variant text-on-surface hover:bg-surface-variant/80'}`}
            >
              {time}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Time log comment..." 
            value={logComment}
            onChange={e => setLogComment(e.target.value)}
            className="flex-1 bg-surface-variant border border-outline-variant rounded px-2 py-1 text-sm focus:outline-none focus:border-primary text-on-surface"
          />
          <button 
            onClick={() => logTimeMutation.mutate()}
            disabled={logTimeMutation.isPending}
            className="bg-primary text-on-primary px-3 py-1 rounded font-label-md text-[13px] hover:brightness-110 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[16px]">timer</span> Log Time
          </button>
        </div>
      </div>
    </div>
  );
}
