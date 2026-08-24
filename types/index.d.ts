declare module '@csvbox/vuejs' {

    import { DefineComponent } from 'vue';

    export interface CSVBoxOptions {
        [key: string]: any;
    }
    
    export interface CSVBoxUser {
        user_id: string;
        [key: string]: string;
    }
    
    export interface CSVBoxEnvironment {
        [key: string]: string;
    }
    
    export interface DynamicColumns {
        [key: string]: any;
    }
    
    export interface CSVBoxButtonProps {
      licenseKey: string;
      onImport?: (success: boolean, data?: any) => void;
      onReady?: () => void;
      onSubmit?: (data: any) => void;
      onClose?: () => void;
      user?: CSVBoxUser;
      dynamicColumns?: DynamicColumns | null;
      options?: CSVBoxOptions;
      dataLocation?: string;
      customDomain?: string;
      debug?: string;
      language?: string;
      lazy?: boolean;
      loadStarted?: () => void;
      environment?: CSVBoxEnvironment | null;
      theme?: string;
    }

    export const CSVBoxButton: DefineComponent<CSVBoxButtonProps>;

}