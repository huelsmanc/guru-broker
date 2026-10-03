// Company library data: folders, files and the forms set up on them. The database decides who sees
// what (private folders: admins and the folder's chosen people); only library managers change it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isAdminRole, can } from '../../../shared/permissions.generated.js';

export const canManageLibrary = (user) => isAdminRole(user?.role) || can(user, 'library.manage');
export const isPdfName = (name = '') => /\.pdf$/i.test(name);
export const isImageName = (name = '') => /\.(png|jpe?g|gif|webp)$/i.test(name);
const byName = (a, b) => String(a.file_name || a.name || '').localeCompare(String(b.file_name || b.name || ''), undefined, { numeric: true, sensitivity: 'base' });

export function useLibrary(brokerageId) {
  const queryClient = useQueryClient();
  const on = !!brokerageId;
  const folders = useQuery({
    queryKey: ['library-folders', brokerageId], enabled: on, staleTime: 60_000,
    queryFn: async () => (await base44.entities.LibraryFolder.filter({ brokerage_id: brokerageId }, 'sort', 500))
      .sort((a, b) => (a.sort ?? 50) - (b.sort ?? 50) || byName(a, b)),
  });
  const files = useQuery({
    queryKey: ['library-files', brokerageId], enabled: on, staleTime: 60_000,
    queryFn: async () => (await base44.entities.FileRepository.filter({ brokerage_id: brokerageId }, 'file_name', 2000)).sort(byName),
  });
  const templates = useQuery({
    queryKey: ['library-templates', brokerageId], enabled: on, staleTime: 60_000,
    queryFn: () => base44.entities.ESignTemplate.filter({ brokerage_id: brokerageId }, '-created_date', 500),
  });
  const refresh = () => {
    for (const k of ['library-folders', 'library-files', 'library-templates', 'file-repository', 'library', 'esign-templates']) queryClient.invalidateQueries({ queryKey: [k] });
  };
  const list = templates.data || [];
  /** The form set up on a file (its boxes and roles), if any. */
  const formOf = (file) => (file && (list.find((t) => t.id === file.esign_template_id) || list.find((t) => t.document_url === file.file_url && (t.fields || []).length))) || null;
  return {
    folders: folders.data || [], files: files.data || [], templates: list, formOf, refresh,
    loading: folders.isLoading || files.isLoading,
  };
}

/** Pages in a PDF the person picked (read in the browser), or null. */
export async function countPages(source) {
  try {
    const { openPdf } = await import('@/lib/pdfText');
    const pdf = await openPdf(source);
    const n = pdf.numPages;
    pdf.destroy?.();
    return n;
  } catch { return null; }
}

/** Upload files into a folder. onEach(index, state) reports progress. */
export async function uploadToFolder({ files, folderId, brokerageId, user, onEach }) {
  const made = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    onEach?.(i, 'uploading');
    try {
      const pages = isPdfName(file.name) ? await countPages(file) : null;
      const res = await base44.integrations.Core.UploadFile({ file, scope: { kind: 'library', id: folderId } });
      const url = res?.file_url || res?.data?.file_url;
      if (!url) throw new Error('no link came back');
      made.push(await base44.entities.FileRepository.create({
        brokerage_id: brokerageId, folder_id: folderId, file_name: file.name, file_url: url, file_size: file.size,
        ...(pages ? { pages } : {}), uploaded_by_email: user?.email, uploaded_by_name: user?.display_name || user?.full_name || user?.email,
      }));
      onEach?.(i, 'done');
    } catch (err) {
      onEach?.(i, `error: ${err.message || err}`);
    }
  }
  return made;
}

export const downloadUrl = (url) => (String(url).includes('/api/file?') ? String(url).replace('/api/file?', '/api/file?download=1&') : url);
export const sizeText = (n) => (!n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
export const pagesText = (n) => (n ? `${n} page${n === 1 ? '' : 's'}` : '');
