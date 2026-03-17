const translations = {
  English: {
    // Header / Dashboard
    changePassword: 'Change Password',
    logout: 'Logout',
    loadingEntries: 'Loading entries...',
    timesheetView: '📅 Timesheet',
    listView: '☰ List',

    // Clock In/Out
    clockIn: 'Clock In',
    clockOut: 'Clock Out',
    currentlyClockedIn: 'Currently clocked in',
    clockingIn: 'Clocking in...',
    clockingOut: 'Clocking out...',
    confirmClockOut: 'Confirm Clock Out',
    selectProjectFirst: 'Select a project first',
    clockInFailed: 'Clock-in failed',
    clockOutFailed: 'Clock-out failed',

    // TimeEntryForm
    logTime: 'Log Time',
    project: 'Project',
    selectProject: 'Select project...',
    regular: 'Regular',
    prevailing: 'Prevailing',
    date: 'Date',
    startTime: 'Start Time',
    endTime: 'End Time',
    wageType: 'Wage type',
    notesOptional: 'Notes (optional)',
    notesPlaceholder: 'Any notes...',
    endAfterStart: 'End time must be after start time',
    failedSaveEntry: 'Failed to save entry',
    entrySaved: 'Entry saved!',
    saving: 'Saving...',
    logEntry: 'Log Entry',

    // Shared field labels
    breakMin: 'Break (min)',
    mileageMi: 'Mileage (mi)',
    optional: 'Optional',
    optionalNotes: 'Optional notes',
    start: 'Start',
    end: 'End',
    notes: 'Notes',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    failedSave: 'Failed to save',

    // EntryList
    yourEntries: 'Your Entries',
    noEntries: 'No entries yet. Log your first time entry above.',
    delete: 'Delete',
    confirmDelete: 'Delete this entry?',
    failedDeleteEntry: 'Failed to delete entry',
    approved: 'Approved',
    rejected: 'Rejected',
    pending: 'Pending',
    messages: 'Messages',
    hide: 'Hide',

    // ChangePassword
    changePasswordTitle: 'Change Password',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmNewPassword: 'Confirm New Password',
    passwordsMustMatch: 'New passwords do not match',
    passwordChanged: 'Password changed!',
    failedChangePassword: 'Failed to change password',
  },

  Spanish: {
    // Header / Dashboard
    changePassword: 'Cambiar Contraseña',
    logout: 'Cerrar Sesión',
    loadingEntries: 'Cargando entradas...',
    timesheetView: '📅 Planilla',
    listView: '☰ Lista',

    // Clock In/Out
    clockIn: 'Registrar Entrada',
    clockOut: 'Registrar Salida',
    currentlyClockedIn: 'Actualmente registrado',
    clockingIn: 'Registrando entrada...',
    clockingOut: 'Registrando salida...',
    confirmClockOut: 'Confirmar Salida',
    selectProjectFirst: 'Selecciona un proyecto primero',
    clockInFailed: 'Error al registrar entrada',
    clockOutFailed: 'Error al registrar salida',

    // TimeEntryForm
    logTime: 'Registrar Tiempo',
    project: 'Proyecto',
    selectProject: 'Seleccionar proyecto...',
    regular: 'Regular',
    prevailing: 'Salario Prevaleciente',
    date: 'Fecha',
    startTime: 'Hora de Entrada',
    endTime: 'Hora de Salida',
    wageType: 'Tipo de salario',
    notesOptional: 'Notas (opcional)',
    notesPlaceholder: 'Cualquier nota...',
    endAfterStart: 'La hora de fin debe ser después de la hora de inicio',
    failedSaveEntry: 'Error al guardar la entrada',
    entrySaved: '¡Entrada guardada!',
    saving: 'Guardando...',
    logEntry: 'Registrar',

    // Shared field labels
    breakMin: 'Descanso (min)',
    mileageMi: 'Millas (mi)',
    optional: 'Opcional',
    optionalNotes: 'Notas opcionales',
    start: 'Entrada',
    end: 'Salida',
    notes: 'Notas',
    save: 'Guardar',
    cancel: 'Cancelar',
    edit: 'Editar',
    failedSave: 'Error al guardar',

    // EntryList
    yourEntries: 'Tus Entradas',
    noEntries: 'Sin entradas aún. Registra tu primera entrada arriba.',
    delete: 'Eliminar',
    confirmDelete: '¿Eliminar esta entrada?',
    failedDeleteEntry: 'Error al eliminar la entrada',
    approved: '✓ Aprobado',
    rejected: '✕ Rechazado',
    pending: 'Pendiente',
    messages: 'Mensajes',
    hide: 'Ocultar',

    // ChangePassword
    changePasswordTitle: 'Cambiar Contraseña',
    currentPassword: 'Contraseña Actual',
    newPassword: 'Nueva Contraseña',
    confirmNewPassword: 'Confirmar Nueva Contraseña',
    passwordsMustMatch: 'Las contraseñas nuevas no coinciden',
    passwordChanged: '¡Contraseña cambiada!',
    failedChangePassword: 'Error al cambiar la contraseña',
  },
};

export function getT(language) {
  return translations[language] || translations.English;
}
