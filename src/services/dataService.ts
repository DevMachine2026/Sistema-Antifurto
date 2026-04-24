import { Transaction, PeopleCountEvent, Alert, ImportBatch, TransactionSource } from '../types';
import { subMinutes, isWithinInterval, parseISO } from 'date-fns';
import { notificationService } from './notificationService';

class DataService {
  private transactions: Transaction[] = [];
  private peopleCount: PeopleCountEvent[] = [];
  private alerts: Alert[] = [];
  private batches: ImportBatch[] = [];

  // Persistence (Simulated for MVP)
  constructor() {
    const savedData = localStorage.getItem('antifraude_data');
    if (savedData) {
      const parsed = JSON.parse(savedData);
      this.transactions = parsed.transactions || [];
      this.peopleCount = parsed.peopleCount || [];
      this.alerts = parsed.alerts || [];
      this.batches = parsed.batches || [];
    }
  }

  private save() {
    localStorage.setItem('antifraude_data', JSON.stringify({
      transactions: this.transactions,
      peopleCount: this.peopleCount,
      alerts: this.alerts,
      batches: this.batches
    }));
  }

  getTransactions() { return this.transactions; }
  getAlerts() { return this.alerts; }
  getPeopleCount() { return this.peopleCount; }
  getBatches() { return this.batches; }

  async addTransactions(newTransactions: Transaction[], batch: ImportBatch) {
    this.transactions.push(...newTransactions);
    this.batches.push(batch);
    this.save();
    await this.runRules();
  }

  async addPeopleCount(event: PeopleCountEvent) {
    this.peopleCount.push(event);
    this.save();
    await this.runRules();
  }

  resolveAlert(alertId: string, user: string) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedBy = user;
      this.save();
    }
  }

  // Fraud Rules (Section 6 of SDD) - Now Async to handle notifications
  private async runRules() {
    const now = new Date();
    
    // R01: Lotação sem Vendas (Cruzamento de Câmera x Ingressos)
    const last30Min = subMinutes(now, 30);
    const latestPeople = this.peopleCount[this.peopleCount.length - 1];
    
    if (latestPeople && latestPeople.peopleInside > 30) {
      const recentSales = this.transactions.filter(t => 
        t.source === 'st_ingressos' && parseISO(t.occurredAt) >= last30Min
      );
      
      if (recentSales.length === 0) {
        await this.createAlert({
          type: 'crowd_no_sales',
          severity: 'high',
          description: `R01: Fluxo de ${latestPeople.peopleInside} pessoas sem vendas registradas nos últimos 30min.`,
          context: { peopleInside: latestPeople.peopleInside, window: '30min' }
        });
      }
    }

    // R02: Gap Financeiro (Cruzamento PagBank x St Ingressos)
    const pagbankTotal = this.transactions
      .filter(t => t.source === 'pagbank')
      .reduce((sum, t) => sum + t.amount, 0);
    const stTotal = this.transactions
      .filter(t => t.source === 'st_ingressos')
      .reduce((sum, t) => sum + t.amount, 0);
    
    if (Math.abs(pagbankTotal - stTotal) > 200) {
      await this.createAlert({
        type: 'card_gap',
        severity: 'high',
        description: `R02: Divergência Crítica detectada entre PagBank e Bilheteria.`,
        context: { pagbankTotal, stTotal, diff: pagbankTotal - stTotal }
      });
    }

    this.save();
  }

  private async createAlert(data: Omit<Alert, 'id' | 'createdAt' | 'resolved'>) {
    // Prevent duplicate active alerts of same type in close proximity
    const existing = this.alerts.find(a => a.type === data.type && !a.resolved);
    if (existing) return;

    const newAlert: Alert = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      resolved: false
    };
    
    this.alerts.unshift(newAlert);
    
    // Envio Push via WhatsApp para Alertas Críticos
    if (newAlert.severity === 'high') {
      await notificationService.sendWhatsAppAlert(newAlert);
    }
  }

  seedDemo() {
    if (this.transactions.length > 0) return;

    const batchId = crypto.randomUUID();
    const mockTransactions: Transaction[] = Array.from({ length: 20 }).map((_, i) => ({
      id: crypto.randomUUID(),
      source: i % 2 === 0 ? 'st_ingressos' : 'pagbank',
      amount: Math.floor(Math.random() * 100) + 50,
      paymentMethod: i % 3 === 0 ? 'credit' : 'debit',
      occurredAt: subMinutes(new Date(), i * 15).toISOString(),
      importedAt: new Date().toISOString(),
      batchId
    }));

    this.transactions = mockTransactions;
    this.peopleCount = [
      { id: '1', cameraId: 'cam1', countIn: 45, countOut: 5, peopleInside: 40, recordedAt: new Date().toISOString() }
    ];
    this.batches = [{
      id: batchId,
      source: 'st_ingressos',
      filename: 'extrato_mock.csv',
      rowsTotal: 20,
      rowsImported: 20,
      rowsFailed: 0,
      status: 'done',
      importedBy: 'Admin',
      createdAt: new Date().toISOString()
    }];
    this.save();
  }
}

export const dataService = new DataService();
dataService.seedDemo();
