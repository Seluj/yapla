import {Component, signal} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {formatDate} from '@angular/common';

// We'll lazy import xlsx only when needed to avoid SSR issues

class Adherent {
  nom: string;
  prenom: string;
  debutAdhesion: Date;
  finAdhesion: Date;

  constructor(nom: string, prenom: string, debutAdhesion: Date, finAdhesion: Date) {
    this.nom = nom;
    this.prenom = prenom;
    this.debutAdhesion = debutAdhesion;
    this.finAdhesion = finAdhesion;
  }

// Pour identifier les entrées en double
  key(): string {
    return `${this.nom || ''}\u0001${this.prenom || ''}`;
  }

  // Pour vérifier si le nom est trop long pour Discord
  isTooLongForDiscord(): boolean {
    const len = (this.nom?.length || 0) + (this.prenom?.length || 0);
    return len > 32;
  }

  // Pour le format d'affichage et CSV
  toString(): string {
    return `${this.nom} ${this.prenom} : ${this.formatDate(this.debutAdhesion)} - ${this.formatDate(this.finAdhesion)}`;
  }


  toCsv(): string {
    return `${this.nom};${this.prenom};${this.formatDate(this.debutAdhesion)};${this.formatDate(this.finAdhesion)}`;
  }


  formatDate(date: Date): string {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  headers: string[] = [];
  rows: any[] = [];

  firstNameCol: string | null = null;
  lastNameCol: string | null = null;
  adhesionStartCol: string | null = null;
  adhesionEndCol: string | null = null;

  exportPath: string = 'adherent.csv';
  parseError: string | null = null;
  statusMessage: string | null = null;

  async onFileChange(evt: Event) {
    this.parseError = null;
    const input = evt.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, {type: 'array'});
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      // Convert to JSON maintaining headers
      const json: any[] = XLSX.utils.sheet_to_json(worksheet, {defval: ''});
      this.rows = json;
      // Extract headers from worksheet: use keys of first row
      const headerSet = new Set<string>();
      json.forEach((row) => Object.keys(row).forEach((k) => headerSet.add(k)));
      this.headers = Array.from(headerSet);
      // Reset selections
      this.firstNameCol = null;
      this.lastNameCol = null;
      this.adhesionStartCol = null;
      this.adhesionEndCol = null;
      headerSet.forEach((h) => {
        if (h.includes('Prénom')) {
          this.firstNameCol = h;
        } else if (h.includes('Nom')) {
          this.lastNameCol = h;
        } else if (h.includes('Début')) {
          this.adhesionStartCol = h;
        } else if (h.includes('Expiration')) {
          this.adhesionEndCol = h;
        }
      })
    } catch (e: any) {
      this.parseError = 'Failed to parse Excel file. Please ensure it is a valid .xlsx or .xls.';
      console.error(e);
      this.headers = [];
      this.rows = [];
    }
  }

  get canExport(): boolean {
    return !!(this.rows.length && this.firstNameCol && this.lastNameCol && this.adhesionStartCol && this.adhesionEndCol);
  }

  formatDate(date: Date): string {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;

    // Si c'est déjà une Date
    if (value instanceof Date) return value;

    // Si c'est un nombre, considérer comme date Excel
    if (typeof value === 'number') {
      // Convertir le numéro de série Excel en date JavaScript
      // Excel commence le 1/1/1900, mais il y a un bug de date bissextile
      const excelEpoch = new Date(1899, 11, 30);
      return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    }

    // Si c'est une chaîne, essayer de l'analyser
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return null;

      // Essayer ISO-8601
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) return date;
    }

    return null;
  }

  exportData() {
    if (!this.canExport) {
      this.statusMessage = "Veuillez compléter toutes les sélections avant d'exporter.";
      return;
    }

    // Collecter les adhérents
    const adherents: Adherent[] = [];

    for (const row of this.rows) {
      const nom = row[this.lastNameCol!];
      const prenom = row[this.firstNameCol!];
      const debut = this.parseDate(row[this.adhesionStartCol!]);
      const fin = this.parseDate(row[this.adhesionEndCol!]);

      if (!nom || !prenom || !debut || !fin) {
        continue;
      }

      adherents.push(new Adherent(nom, prenom, debut, fin));
    }

    adherents.sort((a, b) => a.debutAdhesion.getTime() - b.debutAdhesion.getTime());

    const uniqueAdherents: Adherent[] = [];
    const bestByKey: Record<string, Adherent> = {};

    for (const adherent of adherents) {
      const key = adherent.key();
      if (!bestByKey[key] || adherent.debutAdhesion < bestByKey[key].debutAdhesion) {
        bestByKey[key] = adherent;
      }
    }

    for (const key in bestByKey) {
      uniqueAdherents.push(bestByKey[key]);
    }

    uniqueAdherents.sort((a, b) => a.debutAdhesion.getTime() - b.debutAdhesion.getTime());

    let currentDate = new Date();
    let csvContent = "Base de données;Base de données;" + this.formatDate(currentDate) + ";" + this.formatDate(currentDate) + "\n";
    let errorContent = "";

    for (const adherent of uniqueAdherents) {
      if (adherent.isTooLongForDiscord()) {
        errorContent += adherent.toString() + "\n";
      }
      csvContent += adherent.toCsv() + "\n";
    }

    const csvBlob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const csvUrl = URL.createObjectURL(csvBlob);
    const csvLink = document.createElement('a');
    csvLink.href = csvUrl;
    csvLink.download = this.exportPath;
    document.body.appendChild(csvLink);
    csvLink.click();
    document.body.removeChild(csvLink);
    URL.revokeObjectURL(csvUrl);

    if (errorContent) {
      this.statusMessage = "Exportation terminée avec des erreurs de nom trop longs pour Discord :" +
        "\n" + errorContent +
        "\n";
    }
  }
}
