import { Camera, CameraBrand, CameraType } from '../types';
import { supabase } from '../lib/supabase';
import { getCurrentEstablishmentId } from '../lib/tenant';

type NewCamera = Omit<Camera, 'id' | 'establishmentId' | 'createdAt' | 'status' | 'lastEventAt'>;

class CameraService {
  private get eid() {
    return getCurrentEstablishmentId();
  }

  async getCameras(): Promise<Camera[]> {
    const { data, error } = await supabase
      .from('cameras')
      .select('*')
      .eq('establishment_id', this.eid)
      .order('created_at', { ascending: true });
    if (error) throw error;

    return (data ?? []).map(rowToCamera);
  }

  async addCamera(cam: NewCamera): Promise<Camera> {
    const { data, error } = await supabase
      .from('cameras')
      .insert({
        establishment_id: this.eid,
        name:        cam.name,
        camera_id:   cam.cameraId,
        ip:          cam.ip ?? null,
        port:        cam.port,
        brand:       cam.brand,
        camera_type: cam.cameraType,
        status:      'pending',
        notes:       cam.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToCamera(data);
  }

  async updateCamera(id: string, patch: Partial<NewCamera & { status: Camera['status'] }>): Promise<void> {
    const { error } = await supabase
      .from('cameras')
      .update({
        ...(patch.name        !== undefined && { name:        patch.name }),
        ...(patch.cameraId    !== undefined && { camera_id:   patch.cameraId }),
        ...(patch.ip          !== undefined && { ip:          patch.ip }),
        ...(patch.port        !== undefined && { port:        patch.port }),
        ...(patch.brand       !== undefined && { brand:       patch.brand }),
        ...(patch.cameraType  !== undefined && { camera_type: patch.cameraType }),
        ...(patch.status      !== undefined && { status:      patch.status }),
        ...(patch.notes       !== undefined && { notes:       patch.notes }),
      })
      .eq('id', id)
      .eq('establishment_id', this.eid);
    if (error) throw error;
  }

  async deleteCamera(id: string): Promise<void> {
    const { error } = await supabase
      .from('cameras')
      .delete()
      .eq('id', id)
      .eq('establishment_id', this.eid);
    if (error) throw error;
  }

  // Chamado pelo webhook após receber um evento — marca câmera online
  async markOnline(cameraId: string): Promise<void> {
    const { error } = await supabase
      .from('cameras')
      .update({ status: 'online', last_event_at: new Date().toISOString() })
      .eq('camera_id', cameraId)
      .eq('establishment_id', this.eid);
    if (error) throw error;
  }

  // Aguarda o primeiro evento de uma câmera (para etapa de teste do wizard)
  async waitForFirstEvent(cameraId: string, timeoutMs = 60_000): Promise<boolean> {
    return new Promise((resolve) => {
      const deadline = setTimeout(() => { sub.unsubscribe(); resolve(false); }, timeoutMs);

      const sub = supabase
        .channel(`cam-test-${cameraId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'people_count_events',
            filter: `camera_id=eq.${cameraId}`,
          },
          () => {
            clearTimeout(deadline);
            sub.unsubscribe();
            resolve(true);
          },
        )
        .subscribe();
    });
  }
}

function rowToCamera(row: Record<string, unknown>): Camera {
  return {
    id:              row.id as string,
    establishmentId: row.establishment_id as string,
    name:            row.name as string,
    cameraId:        row.camera_id as string,
    ip:              (row.ip as string) ?? undefined,
    port:            row.port as number,
    brand:           row.brand as CameraBrand,
    cameraType:      row.camera_type as CameraType,
    status:          row.status as Camera['status'],
    lastEventAt:     (row.last_event_at as string) ?? undefined,
    notes:           (row.notes as string) ?? undefined,
    createdAt:       row.created_at as string,
  };
}

export const cameraService = new CameraService();
