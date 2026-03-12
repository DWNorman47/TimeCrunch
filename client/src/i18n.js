const translations = {
  English: {
    // Header
    changePassword: 'Change Password',
    logout: 'Logout',
    loadingEntries: 'Loading entries...',

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

    // EntryList
    yourEntries: 'Your Entries',
    noEntries: 'No entries yet. Log your first time entry above.',
    delete: 'Delete',
    confirmDelete: 'Delete this entry?',
    failedDeleteEntry: 'Failed to delete entry',

    // ChangePassword
    changePasswordTitle: 'Change Password',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmNewPassword: 'Confirm New Password',
    passwordsMustMatch: 'New passwords do not match',
    passwordChanged: 'Password changed!',
    save: 'Save',
    cancel: 'Cancel',
    failedChangePassword: 'Failed to change password',
  },
  Spanish: {
    // Header
    changePassword: 'Cambiar Contraseña',
    logout: 'Cerrar Sesión',
    loadingEntries: 'Cargando entradas...',

    // TimeEntryForm
    logTime: 'Registrar Tiempo',
    project: 'Proyecto',
    selectProject: 'Seleccionar proyecto...',
    regular: 'Regular',
    prevailing: 'Salario Prevaleciente',
    date: 'Fecha',
    startTime: 'Hora de Inicio',
    endTime: 'Hora de Fin',
    wageType: 'Tipo de salario',
    notesOptional: 'Notas (opcional)',
    notesPlaceholder: 'Cualquier nota...',
    endAfterStart: 'La hora de fin debe ser después de la hora de inicio',
    failedSaveEntry: 'Error al guardar la entrada',
    entrySaved: '¡Entrada guardada!',
    saving: 'Guardando...',
    logEntry: 'Registrar Entrada',

    // EntryList
    yourEntries: 'Tus Entradas',
    noEntries: 'Sin entradas aún. Registra tu primera entrada arriba.',
    delete: 'Eliminar',
    confirmDelete: '¿Eliminar esta entrada?',
    failedDeleteEntry: 'Error al eliminar la entrada',

    // ChangePassword
    changePasswordTitle: 'Cambiar Contraseña',
    currentPassword: 'Contraseña Actual',
    newPassword: 'Nueva Contraseña',
    confirmNewPassword: 'Confirmar Nueva Contraseña',
    passwordsMustMatch: 'Las contraseñas nuevas no coinciden',
    passwordChanged: '¡Contraseña cambiada!',
    save: 'Guardar',
    cancel: 'Cancelar',
    failedChangePassword: 'Error al cambiar la contraseña',
  },
};

export function getT(language) {
  return translations[language] || translations.English;
}
